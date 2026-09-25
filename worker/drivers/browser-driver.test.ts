import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { mkdtempSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCommonUi } from '../../shared/common-ui.js';
import { catalogue, paths, persona } from '../../shared/test-helpers/fixtures.js';
import type { Persona } from '../../shared/persona-schema.js';
import type { UseCase } from '../../shared/catalogue-schema.js';
import { liveFake } from '../test-helpers/live-fake.js';
import { launchBrowser } from './browser.js';
import { BrowserDriver } from './browser-driver.js';
import type { AttemptContext, Mistake } from '../engine/types.js';

const uc = (id: string) => catalogue.useCases.find((u) => u.id === id)!;
const commonUi = loadCommonUi(paths.ui);
let browser: Browser;
beforeAll(async () => {
  browser = await launchBrowser(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE);
});
afterAll(async () => browser.close());

async function session(p: Persona, fake: Awaited<ReturnType<typeof liveFake>>, shots: string | null = null) {
  return BrowserDriver.open(browser, p, { baseUrl: fake.baseUrl, runHeader: () => fake.runHeader(), screenshotDir: shots, stepTimeoutMs: 2500, commonUi });
}
function ctx(p: Persona, vars: Record<string, string>, mistakes: Mistake[] = [], label = 'step'): AttemptContext {
  return { persona: p, vars: { locale: p.locale, ...vars }, mistakes, label };
}
async function verified(fake: Awaited<ReturnType<typeof liveFake>>, d: BrowserDriver, p: Persona, vars: Record<string, string>) {
  await d.attempt(uc('signup'), ctx(p, vars));
  const u = fake.deps.store.userByEmail(vars.email!)!;
  vars.verifyUrl = `${fake.baseUrl}/api/auth/verify-email?token=${u.verifyToken}`;
  expect((await d.attempt(uc('verify-email'), ctx(p, vars))).ok).toBe(true);
  expect((await d.attempt(uc('login'), ctx(p, vars))).ok).toBe(true);
}

describe('BrowserDriver against the fake Orqea', () => {
  it('a French mobile persona lives landing → first card; facts are measured', async () => {
    const fake = await liveFake();
    const shots = mkdtempSync(join(tmpdir(), 'shots-'));
    const p = persona('retired-volunteer');
    const d = await session(p, fake, shots);
    const vars = { email: 'synth+r1-retired-volunteer@synthetic.invalid', password: 'Str0ngPassword1', boardName: 'Banque alimentaire', cardTitle: 'Planning samedi' };
    const landing = await d.attempt(uc('landing'), ctx(p, vars, [], 'landing'));
    expect(landing.ok).toBe(true);
    expect(landing.facts.cookieBanner).toBe(true);
    expect(landing.facts.clicksToGoal).toBe(1); // cookie rejection
    expect(landing.pages).toEqual(['/']);
    expect(existsSync(join(shots, landing.screenshot!))).toBe(true);
    const signup = await d.attempt(uc('signup'), ctx(p, vars));
    expect(signup.ok).toBe(true);
    expect(signup.facts).toMatchObject({ visibleFields: 4, termsCheckbox: true, validationErrors: 0 });
    expect(signup.apiCalls.find((c) => c.path === '/api/auth/register')?.status).toBe(201);
    const u = fake.deps.store.userByEmail(vars.email)!;
    expect(u.language).toBe('fr');
    const verifyUrl = `${fake.baseUrl}/api/auth/verify-email?token=${u.verifyToken}`;
    expect((await d.attempt(uc('verify-email'), ctx(p, { ...vars, verifyUrl }))).ok).toBe(true);
    expect((await d.attempt(uc('login'), ctx(p, vars))).ok).toBe(true);
    expect((await d.attempt(uc('create-board'), ctx(p, vars))).ok).toBe(true);
    const card = await d.attempt(uc('create-card'), ctx(p, vars));
    expect(card.ok).toBe(true);
    expect(card.facts.foreignText).toBe(false);
    await d.close();
    await fake.close();
  });

  it('mistakes show clear errors; unclear scenario is measured as unclear', async () => {
    for (const unclear of [false, true]) {
      const fake = await liveFake({}, { unclearErrors: unclear });
      const p = persona('student');
      const d = await session(p, fake);
      const vars = { email: 'synth+r1-student@synthetic.invalid', password: 'Str0ngPassword1' };
      const r = await d.attempt(uc('signup'), ctx(p, vars, ['typoEmail', 'forgetTerms']));
      expect(r.ok).toBe(false);
      expect(r.error).toContain('error shown');
      expect(r.facts.validationErrors).toBe(1);
      expect(r.facts.unclearErrors).toBe(unclear ? 1 : 0);
      await d.close();
      await fake.close();
    }
  });

  it('paywall (402) is reported with its feature', async () => {
    const fake = await liveFake();
    const p = persona('project-manager');
    const d = await session(p, fake);
    const vars = { email: 'synth+r1-project-manager@synthetic.invalid', password: 'Str0ngPassword1', boardName: 'Q3', cardTitle: 'Kickoff' };
    await verified(fake, d, p, vars);
    await d.attempt(uc('create-board'), ctx(p, vars));
    const r = await d.attempt(uc('automation-rule'), ctx(p, vars));
    expect(r.ok).toBe(false);
    expect(r.paywall).toEqual({ code: 'FEATURE_LOCKED', featureKey: 'automation' });
    expect(r.facts.paywall).toBe(true);
    expect(r.error).toContain('paywall shown');
    await d.close();
    await fake.close();
  });

  it('drag and drop, select, check, press and every other kind of step', async () => {
    const fake = await liveFake({}, { lockedFeatures: [] });
    const p = persona('agency');
    const d = await session(p, fake);
    const vars = { email: 'synth+r1-agency@synthetic.invalid', password: 'Str0ngPassword1', boardName: 'Client A', cardTitle: 'Brief', inviteEmail: 'jo@example.com' };
    await verified(fake, d, p, vars);
    for (const id of ['onboarding', 'create-board', 'create-list', 'create-card', 'move-card', 'card-priority', 'edit-card', 'checklist', 'comment', 'bulk-actions', 'automation-rule', 'invite-member', 'invite-without-account', 'mention', 'calendar', 'notes-reminder', 'form-create', 'form-answer-public', 'qr-create', 'global-search', 'settings-theme', 'settings-language', 'data-export', 'billing-view-plans']) {
      const r = await d.attempt(uc(id), ctx(p, vars));
      expect(r.ok, `${id}: ${r.error}`).toBe(true);
    }
    const checkout = await d.attempt(uc('billing-checkout'), ctx(p, { ...vars, planName: 'Pro', planKey: 'pro' }));
    expect(checkout.ok, checkout.error ?? '').toBe(true);
    expect((await d.attempt(uc('account-delete'), ctx(p, vars))).ok).toBe(true);
    await d.close();
    await fake.close();
  });

  it('screen-reader persona: keyboard only, blocked by unnamed controls and by drag and drop', async () => {
    const fake = await liveFake({}, { unnamedControls: true });
    const p = persona('screen-reader-user');
    const d = await session(p, fake);
    const vars = { email: 'synth+r1-screen-reader-user@synthetic.invalid', password: 'Str0ngPassword1', boardName: 'Mine', cardTitle: 'Read mail' };
    await verified(fake, d, p, vars);
    expect((await d.attempt(uc('create-board'), ctx(p, vars))).ok).toBe(true);
    const card = await d.attempt(uc('create-card'), ctx(p, vars));
    expect(card.ok).toBe(false);
    expect(card.facts.targetUnnamed).toBe(true);
    expect(card.facts.unnamedControls).toBeGreaterThan(0);
    const drag: UseCase = { ...uc('move-card'), ui: [{ action: 'goto', path: '/boards' }, { action: 'drag', target: { role: 'link', name: { en: 'Mine', fr: 'Mine' } }, to: { role: 'link', name: { en: 'Mine', fr: 'Mine' } } }] };
    const r = await d.attempt(drag, ctx(p, vars));
    expect(r.error).toContain('no keyboard alternative');
    expect(r.facts.targetUnnamed).toBe(false);
    await d.close();
    await fake.close();
  });

  it('untranslated pages: the French persona falls back to English names and notices', async () => {
    const fake = await liveFake({}, { untranslated: true });
    const p = persona('teacher');
    const d = await session(p, fake);
    const r = await d.attempt(uc('landing'), ctx(p, {}));
    expect(r.ok).toBe(true);
    expect(r.facts.foreignText).toBe(true);
    await d.close();
    await fake.close();
  });

  it('captcha-would-show header and slow pages', async () => {
    const fake = await liveFake({}, { captcha: true, slowMs: 300 });
    const p = persona('tech-lead');
    const d = await session(p, fake);
    const signup = await d.attempt(uc('signup'), ctx(p, { email: 'synth+r1-tech-lead@synthetic.invalid', password: 'Str0ngPassword1' }));
    expect(signup.facts.captcha).toBe(true);
    expect(signup.facts.timeToInteractiveMs).toBeGreaterThanOrEqual(250);
    await d.close();
    await fake.close();
  });

  it('5xx, non-JSON 402, missing controls, hidden elements and unreachable targets', async () => {
    const server = createServer((req, res) => {
      const html = (status: number, body: string) => {
        res.writeHead(status, { 'content-type': 'text/html' });
        res.end(`<html lang="en"><body>${body}</body></html>`);
      };
      if (req.url === '/boom') return html(500, '<h1>Oops</h1>');
      if (req.url === '/pay') return html(402, '<h1>Pay</h1>');
      if (req.url === '/limit' || req.url === '/empty') {
        res.writeHead(402, { 'content-type': 'application/json' });
        return res.end(req.url === '/limit' ? '{"limitKey":"boards"}' : '{}');
      }
      return html(200, '<h1>Visible</h1><h2 hidden>Ghost</h2>');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const p = persona('tech-lead');
    const d = await BrowserDriver.open(browser, p, { baseUrl, runHeader: () => 'r.1.x', screenshotDir: null, stepTimeoutMs: 1000, commonUi });
    const probe = (path: string, ...rest: UseCase['ui']): UseCase => ({ ...uc('landing'), ui: [{ action: 'goto', path }, ...rest] });
    expect((await d.attempt(probe('/boom'), ctx(p, {}))).facts.networkErrors).toBe(1);
    expect((await d.attempt(probe('/pay'), ctx(p, {}))).paywall).toEqual({ code: 'PAYWALL', featureKey: 'unknown' });
    expect((await d.attempt(probe('/limit'), ctx(p, {}))).paywall).toEqual({ code: 'PAYWALL', featureKey: 'boards' });
    expect((await d.attempt(probe('/empty'), ctx(p, {}))).paywall).toEqual({ code: 'PAYWALL', featureKey: 'unknown' });
    const heading = (name: string) => ({ action: 'expect' as const, target: { role: 'heading', name: { en: name, fr: name } } });
    expect((await d.attempt(probe('/', heading('Visible')), ctx(p, {}))).ok).toBe(true);
    const ghost = await d.attempt(probe('/', heading('Ghost')), ctx(p, {}));
    expect(ghost.error).toBe('step 2: no heading named "Ghost"');
    expect(ghost.facts.targetUnnamed).toBe(false);
    await new Promise((r) => server.close(r));
    server.closeAllConnections();
    const down = await d.attempt(probe('/'), ctx(p, {}));
    expect(down.ok).toBe(false);
    expect(down.facts.networkErrors).toBeGreaterThan(0);
    await d.close();
  });
});
