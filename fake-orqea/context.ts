import type { FastifyReply, FastifyRequest } from 'fastify';
import { CAPTCHA_HEADER, RUN_HEADER, verifyRunHeader } from '../shared/synthetic.js';
import type { View } from './html.js';
import { pickLang, translator, type Key } from './i18n.js';
import type { Scenario, ScenarioRegistry } from './scenario.js';
import type { Store, User } from './store.js';

export interface FakeConfig {
  serviceSecret: string;
  env: string;
  stripeMode: 'test' | 'live' | 'off';
  syntheticEnabled: boolean;
  /** Source addresses (prefix match) allowed to call the admin API besides loopback. */
  adminAllowed: string[];
  version: string;
  ssoSecret: string;
  appUrl: string;
  appId: string;
  nowS: () => number;
}

export interface Deps {
  config: FakeConfig;
  store: Store;
  scenarios: ScenarioRegistry;
}

export interface Ctx {
  runId: string | null;
  scenario: Scenario;
  user: User | undefined;
  view: View;
}

export function bearer(req: FastifyRequest): string | undefined {
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : req.cookies.orqea_token;
}

export function ctxOf(req: FastifyRequest, deps: Deps): Ctx {
  const runId = verifyRunHeader(
    req.headers[RUN_HEADER] as string | undefined,
    deps.config.serviceSecret,
    deps.config.nowS(),
  );
  const scenario = deps.scenarios.get(runId);
  const user = deps.store.userByToken(bearer(req));
  const lang = pickLang(req.headers['accept-language'], user?.language);
  const query = req.query as Record<string, string | undefined>;
  const view: View = {
    lang,
    t: translator(lang, scenario.untranslated),
    scenario,
    user,
    done: query.done,
    consent: req.cookies.consent !== undefined,
  };
  return { runId, scenario, user, view };
}

/** 4xx with an explanation — or a useless one in the "unclearErrors" scenario. */
export function fail(reply: FastifyReply, ctx: Ctx, status: number, code: string, key: Key) {
  const message = ctx.scenario.unclearErrors ? ctx.view.t('err_generic') : ctx.view.t(key);
  return reply.code(status).send({ error: code, message });
}

/** Captcha: real users must solve it; valid synthetic runs skip it but are told it would show. */
export function captchaRequired(reply: FastifyReply, ctx: Ctx): boolean {
  if (!ctx.scenario.captcha) return false;
  if (ctx.runId) {
    reply.header(CAPTCHA_HEADER, '1');
    return false;
  }
  return true;
}

export function paywall(reply: FastifyReply, ctx: Ctx, feature: string) {
  return reply.code(402).send({ code: 'FEATURE_LOCKED', feature, planKey: 'pro', upgrade: true });
}

export function locked(ctx: Ctx, feature: string): boolean {
  return ctx.user?.plan === 'free' && ctx.scenario.lockedFeatures.includes(feature);
}
