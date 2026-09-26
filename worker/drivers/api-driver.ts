import { emptyFacts, type Facts } from '../../shared/facts.js';
import type { ApiStep, UseCase } from '../../shared/catalogue-schema.js';
import { CAPTCHA_HEADER, RUN_HEADER } from '../../shared/synthetic.js';
import { applyMistakes } from '../engine/mistakes.js';
import { buildBody, fillTemplate, readPath } from '../engine/template.js';
import type { ApiCall, AttemptContext, Driver, Paywall, StepOutcome } from '../engine/types.js';
import type { RateLimiter } from './limiter.js';

export interface ApiDriverOptions {
  baseUrl: string;
  runHeader: () => string;
  fetchImpl: typeof fetch;
  now: () => number;
  limiter: RateLimiter | null;
}

export function isUnclear(message: string): boolean {
  return (
    message.trim().length < 15 ||
    /^(error|erreur|invalid|invalide|oops|something went wrong)\W*$/i.test(message.trim())
  );
}

/** Drives the target's HTTP API only: the high-volume, load-truth driver. */
export class ApiDriver implements Driver {
  constructor(private readonly opts: ApiDriverOptions) {}

  async attempt(useCase: UseCase, ctx: AttemptContext): Promise<StepOutcome> {
    const started = this.opts.now();
    let facts: Facts = emptyFacts();
    const calls: ApiCall[] = [];
    const captured: Record<string, string> = {};
    let paywall: Paywall | null = null;
    let error: string | null = null;
    for (const step of useCase.api) {
      const vars = { ...ctx.vars, ...captured };
      const res = await this.call(step, vars, ctx);
      calls.push({ method: step.method, path: step.path, status: res.status, ms: res.ms });
      facts = {
        ...facts,
        captcha: facts.captcha || res.captcha,
        clicksToGoal: facts.clicksToGoal + 1,
      };
      const expected = step.expectStatus ?? [];
      const ok =
        expected.length > 0 ? expected.includes(res.status) : res.status >= 200 && res.status < 300;
      if (ok) {
        for (const [name, path] of Object.entries(step.save ?? {})) {
          const v = readPath(res.json, path);
          if (v !== undefined) captured[name] = String(v);
        }
        continue;
      }
      if (res.status === 402) {
        paywall = {
          code: String(res.json.code ?? 'PAYWALL'),
          featureKey: String(res.json.feature ?? res.json.limitKey ?? 'unknown'),
        };
        facts.paywall = true;
      } else if (res.status === 0 || res.status >= 500) {
        facts.networkErrors += 1;
      } else {
        facts.validationErrors += 1;
        // Orqea explains with a short message plus `issues` ("Weak password" + what is missing).
        const issues = Array.isArray(res.json.issues) ? res.json.issues.map(String) : [];
        facts.unclearErrors += isUnclear([String(res.json.message ?? ''), ...issues].join(' '))
          ? 1
          : 0;
      }
      // Orqea answers `{message}` (auth, most routes) or `{code}` (rules, forms, 402); the fake used
      // `{error}`. The first one present names the failure.
      const why = res.json.error ?? res.json.code ?? res.json.message;
      error = `${step.method} ${step.path} → ${res.status}${why === undefined ? '' : ` ${String(why)}`}`;
      break;
    }
    const wallMs = this.opts.now() - started;
    facts.timeToInteractiveMs = wallMs;
    return {
      ok: error === null,
      facts,
      error,
      paywall,
      screenshot: null,
      apiCalls: calls,
      wallMs,
      captured,
      navigationStatus: null,
      pages: [],
    };
  }

  private async call(step: ApiStep, vars: Record<string, string>, ctx: AttemptContext) {
    const encoded = Object.fromEntries(
      Object.entries(vars).map(([k, v]) => [k, encodeURIComponent(v)]),
    );
    const typed = {
      ...vars,
      email: applyMistakes('{{email}}', vars.email ?? '', ctx.mistakes),
      password: applyMistakes('{{password}}', vars.password ?? '', ctx.mistakes),
    };
    let body = step.body === undefined ? undefined : buildBody(step.body, typed);
    if (
      body &&
      typeof body === 'object' &&
      'acceptedTerms' in body &&
      ctx.mistakes.includes('forgetTerms')
    ) {
      body = { ...body, acceptedTerms: false };
    }
    const headers: Record<string, string> = {
      [RUN_HEADER]: this.opts.runHeader(),
      accept: 'application/json',
      'accept-language': ctx.persona.locale,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (step.auth !== false && vars.token) headers.authorization = `Bearer ${vars.token}`;
    await this.opts.limiter?.take();
    const t0 = this.opts.now();
    try {
      const res = await this.opts.fetchImpl(this.opts.baseUrl + fillTemplate(step.path, encoded), {
        method: step.method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        status: res.status,
        json,
        ms: this.opts.now() - t0,
        captcha: res.headers.get(CAPTCHA_HEADER) === '1',
      };
    } catch {
      return {
        status: 0,
        json: {} as Record<string, unknown>,
        ms: this.opts.now() - t0,
        captcha: false,
      };
    }
  }

  async close(): Promise<void> {}
}
