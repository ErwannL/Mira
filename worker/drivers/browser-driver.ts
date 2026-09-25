import type { Browser, BrowserContext, Locator, Page, Response } from 'playwright';
import { join } from 'node:path';
import { emptyFacts, mergeFacts, type Facts } from '../../shared/facts.js';
import type { UiStep, UiTarget, UseCase } from '../../shared/catalogue-schema.js';
import type { CommonUi } from '../../shared/common-ui.js';
import { VIEWPORTS, type Persona } from '../../shared/persona-schema.js';
import { CAPTCHA_HEADER, RUN_HEADER } from '../../shared/synthetic.js';
import { applyMistakes, skipsStep } from '../engine/mistakes.js';
import { fillTemplate } from '../engine/template.js';
import type { ApiCall, AttemptContext, Driver, Paywall, StepOutcome } from '../engine/types.js';
import { measureScript, type PageMeasure } from './measure.js';

export interface BrowserDriverOptions {
  baseUrl: string;
  runHeader: () => string;
  screenshotDir: string | null;
  stepTimeoutMs: number;
  commonUi: CommonUi;
}

class StepFailure extends Error {
  constructor(message: string, readonly role: string | null) {
    super(message);
  }
}

/** Drives the real web app like the persona would: roles and accessible names only. */
export class BrowserDriver implements Driver {
  private facts: Facts = emptyFacts();
  private calls: ApiCall[] = [];
  private paywall: Paywall | null = null;
  private pending: Promise<void>[] = [];
  private measuredUrl = '';

  private constructor(private readonly context: BrowserContext, private readonly page: Page, private readonly persona: Persona, private readonly opts: BrowserDriverOptions) {
    page.on('response', (r) => this.onResponse(r));
    page.on('requestfailed', () => {
      this.facts.networkErrors += 1;
    });
  }

  static async open(browser: Browser, persona: Persona, opts: BrowserDriverOptions): Promise<BrowserDriver> {
    const vp = VIEWPORTS[persona.device];
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      locale: persona.locale === 'fr' ? 'fr-FR' : 'en-GB',
      timezoneId: persona.timezone,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(opts.stepTimeoutMs);
    return new BrowserDriver(context, page, persona, opts);
  }

  private onResponse(r: Response): void {
    const url = new URL(r.url());
    if (r.headers()[CAPTCHA_HEADER] === '1') this.facts.captcha = true;
    if (r.status() >= 500) this.facts.networkErrors += 1;
    if (url.pathname.startsWith('/api')) {
      const path = url.pathname.replace(/\/[a-z]+\d[0-9a-z]*(?=\/|$)/g, '/:id');
      this.calls.push({ method: r.request().method(), path, status: r.status(), ms: Math.round(r.request().timing().responseEnd) });
    }
    if (r.status() === 402) {
      this.pending.push(
        r.json().then(
          (b: Record<string, unknown>) => {
            this.paywall = { code: String(b.code ?? 'PAYWALL'), featureKey: String(b.feature ?? b.limitKey ?? 'unknown') };
          },
          () => {
            this.paywall = { code: 'PAYWALL', featureKey: 'unknown' };
          },
        ),
      );
    }
  }

  async attempt(useCase: UseCase, ctx: AttemptContext): Promise<StepOutcome> {
    const started = Date.now();
    this.facts = emptyFacts();
    this.calls = [];
    this.paywall = null;
    this.pending = [];
    const pages: string[] = [];
    await this.context.setExtraHTTPHeaders({ [RUN_HEADER]: this.opts.runHeader() });
    let error: string | null = null;
    try {
      for (const [i, step] of useCase.ui.entries()) await this.run(step, i, ctx, pages);
    } catch (e) {
      const failure = e as StepFailure;
      error = failure.message;
      if (failure.role) this.facts.targetUnnamed = (await this.measure()).unnamedByRole[failure.role] !== undefined;
    }
    await Promise.all(this.pending);
    this.absorb(await this.measure());
    this.facts.paywall = this.paywall !== null;
    const screenshot = await this.screenshot(ctx.label);
    return { ok: error === null, facts: this.facts, error, paywall: this.paywall, screenshot, apiCalls: this.calls, wallMs: Date.now() - started, captured: {}, pages };
  }

  private async run(step: UiStep, index: number, ctx: AttemptContext, pages: string[]): Promise<void> {
    if (step.action === 'goto' || step.action === 'openVerifyUrl') {
      const url = step.action === 'goto' ? this.opts.baseUrl + fillTemplate(step.path, ctx.vars) : (ctx.vars.verifyUrl as string);
      const t0 = Date.now();
      await this.page.goto(url, { waitUntil: 'load' });
      this.facts.timeToInteractiveMs = Math.max(this.facts.timeToInteractiveMs, Date.now() - t0);
      pages.push(new URL(this.page.url()).pathname);
      this.measuredUrl = this.page.url();
      this.absorb(await this.measure());
      await this.dismissCookies();
      return;
    }
    if (step.action === 'press') {
      await this.page.keyboard.press(step.key);
      this.facts.clicksToGoal += 1;
      return;
    }
    if (step.action === 'check' && skipsStep(step.target.role, ctx.mistakes)) return;
    if (this.page.url() !== this.measuredUrl) {
      // A click navigated: measure the new page the persona is now looking at.
      this.measuredUrl = this.page.url();
      this.absorb(await this.measure());
    }
    const target = await this.find(step.target, index, ctx);
    // find() only returns visible controls, so an "expect" step is complete here.
    if (step.action === 'expect') return;
    await this.act(step, target, ctx, index);
  }

  private async act(step: Exclude<UiStep, { action: 'goto' | 'openVerifyUrl' | 'press' | 'expect' }>, target: Locator, ctx: AttemptContext, index: number): Promise<void> {
    const keyboard = this.persona.assistive?.keyboardOnly === true;
    if (step.action === 'fill') {
      await target.fill(applyMistakes(step.value, fillTemplate(step.value, ctx.vars), ctx.mistakes));
    } else if (step.action === 'select') {
      await target.selectOption(fillTemplate(step.value, ctx.vars));
    } else if (step.action === 'drag') {
      if (keyboard) throw new StepFailure(`step ${index + 1}: drag and drop has no keyboard alternative`, null);
      await target.dragTo(await this.find(step.to, index, ctx));
    } else if (keyboard) {
      await target.focus();
      await this.page.keyboard.press(step.action === 'check' ? 'Space' : 'Enter');
    } else if (step.action === 'check') {
      await target.check();
    } else {
      await target.click();
    }
    this.facts.clicksToGoal += 1;
  }

  private locate(target: UiTarget, name: string): Locator {
    const exact = target.exact ?? false;
    if (target.role === 'password') {
      return this.page.getByLabel(name, { exact }).and(this.page.locator('input[type="password"]')).first();
    }
    return this.page.getByRole(target.role as Parameters<Page['getByRole']>[0], { name, exact }).first();
  }

  /** Finds a control by role + accessible name in the persona's language, else in the other one. */
  private async find(target: UiTarget, index: number, ctx: AttemptContext): Promise<Locator> {
    const own = ctx.persona.locale;
    const other = own === 'fr' ? 'en' : 'fr';
    const mine = this.locate(target, fillTemplate(target.name[own], ctx.vars));
    const theirs = this.locate(target, fillTemplate(target.name[other], ctx.vars));
    const blocker = this.page.getByRole('alert').or(this.page.getByRole('alertdialog')).first();
    try {
      await mine.or(theirs).or(blocker).first().waitFor({ state: 'visible' });
    } catch {
      throw new StepFailure(`step ${index + 1}: no ${target.role} named "${fillTemplate(target.name[own], ctx.vars)}"`, target.role);
    }
    if (await mine.isVisible()) return mine;
    if (await theirs.isVisible()) {
      this.facts.foreignText = true;
      return theirs;
    }
    await Promise.all(this.pending);
    const blocked = this.paywall ? 'paywall shown' : `error shown: ${(await blocker.innerText()).trim()}`;
    throw new StepFailure(`step ${index + 1}: ${blocked}`, null);
  }

  private async dismissCookies(): Promise<void> {
    const ui = this.opts.commonUi;
    const own = this.persona.locale;
    const other = own === 'fr' ? 'en' : 'fr';
    const dialog = this.page.getByRole('dialog', { name: ui.cookieDialog[own] });
    if (!(await dialog.isVisible())) return;
    const choice = this.persona.privacyConcern >= 0.5 ? ui.cookieReject : ui.cookieAccept;
    // Same fallback as find(): an untranslated banner is still dismissed, but noticed.
    const mine = dialog.getByRole('button', { name: choice[own] });
    const button = (await mine.isVisible()) ? mine : dialog.getByRole('button', { name: choice[other] });
    if (button !== mine) this.facts.foreignText = true;
    await button.click();
    this.facts.clicksToGoal += 1;
  }

  private async measure(): Promise<PageMeasure> {
    try {
      return (await this.page.evaluate(measureScript(this.persona.locale))) as PageMeasure;
    } catch {
      // The page was navigating (redirect, error page): measure once it has settled.
      await this.page.waitForLoadState('load');
      return (await this.page.evaluate(measureScript(this.persona.locale))) as PageMeasure;
    }
  }

  private absorb(m: PageMeasure): void {
    const f = emptyFacts({
      visibleFields: m.visibleFields,
      requiredFields: m.requiredFields,
      visibleWords: m.visibleWords,
      unnamedControls: m.unnamedControls,
      captcha: m.captcha,
      cookieBanner: m.cookieBanner,
      termsCheckbox: m.termsCheckbox,
      horizontalOverflow: m.horizontalOverflow,
      foreignText: m.foreignText,
      validationErrors: m.validationErrors,
      unclearErrors: m.unclearErrors,
    });
    // Alerts are a snapshot of the current page, not a running total.
    this.facts = mergeFacts({ ...this.facts, validationErrors: 0, unclearErrors: 0 }, f);
  }

  private async screenshot(label: string): Promise<string | null> {
    if (!this.opts.screenshotDir) return null;
    const file = `${label.replace(/[^a-z0-9-]/gi, '_')}.jpg`;
    await this.page.screenshot({ path: join(this.opts.screenshotDir, file), type: 'jpeg', quality: 50 });
    return file;
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}
