import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { parseSyntheticEmail } from '../../shared/synthetic.js';
import { captchaRequired, ctxOf, fail, type Deps } from '../context.js';
import { layout, esc } from '../html.js';
import { EXTRA_FIELDS, pickLang, translator } from '../i18n.js';
import { checkPassword, hashPassword } from '../store.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG = /^(?=.*\d)(?=.*[A-Za-z]).{10,}$/;

export function authApi(app: FastifyInstance, deps: Deps): void {
  const { store } = deps;
  const brakes = new Map<string, number[]>();

  app.post('/api/auth/register', async (req, reply) => {
    const ctx = ctxOf(req, deps);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) return fail(reply, ctx, 400, 'INVALID_EMAIL', 'err_email');
    if (!STRONG.test(String(b.password ?? ''))) return fail(reply, ctx, 400, 'WEAK_PASSWORD', 'err_password');
    const extras = EXTRA_FIELDS.slice(0, ctx.scenario.extraSignupFields);
    if (extras.some((k) => !String(b[k] ?? '').trim())) return fail(reply, ctx, 400, 'MISSING_FIELD', 'err_required');
    if (b.acceptedTerms !== true) return fail(reply, ctx, 400, 'TERMS_REQUIRED', 'err_terms');
    if (captchaRequired(reply, ctx) && b.captcha !== true) return fail(reply, ctx, 400, 'CAPTCHA', 'err_captcha');
    if (store.userByEmail(email)) return fail(reply, ctx, 409, 'EMAIL_EXISTS', 'err_exists');
    const user = {
      id: store.id('u'),
      email,
      username: typeof b.username === 'string' && b.username ? b.username : null,
      passwordHash: hashPassword(String(b.password)),
      verified: false,
      verifyToken: randomBytes(16).toString('hex'),
      language: ctx.view.lang,
      theme: 'light',
      plan: 'free',
      onboarded: false,
      createdAt: deps.config.nowS(),
      runId: parseSyntheticEmail(email)?.runId ?? null,
    };
    store.users.set(user.id, user);
    return reply.code(201).send({ id: user.id, email: user.email, username: user.username });
  });

  app.get('/api/auth/verify-email', async (req, reply) => {
    const ctx = ctxOf(req, deps);
    const token = (req.query as Record<string, string | undefined>).token;
    const user = [...store.users.values()].find((u) => token && u.verifyToken === token);
    if (user) user.verified = true;
    const html = (req.headers.accept ?? '').includes('text/html');
    if (!user) {
      reply.code(400);
      const t = ctx.view.t;
      return html ? reply.type('text/html').send(layout(ctx.view, t('invalidLink'), `<h1>${esc(t('invalidLink'))}</h1>`)) : { error: 'INVALID_TOKEN' };
    }
    if (!html) return { verified: true };
    // The page speaks the language the account was created in.
    const lang = pickLang(undefined, user.language);
    const view = { ...ctx.view, lang, t: translator(lang, ctx.scenario.untranslated) };
    const t = view.t;
    return reply.type('text/html').send(layout(view, t('emailVerified'), `<h1>${esc(t('emailVerified'))}</h1><p>${esc(t('emailVerifiedText'))}</p><a href="/login">${esc(t('logIn'))}</a>`));
  });

  app.post('/api/auth/login', async (req, reply) => {
    const ctx = ctxOf(req, deps);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const now = deps.config.nowS();
    const recent = (brakes.get(req.ip) ?? []).filter((t) => now - t < 60);
    if (!ctx.runId && recent.length >= 5) return reply.code(429).send({ error: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts, wait a minute.' });
    const user = store.userByEmail(String(b.email ?? '').trim().toLowerCase());
    if (!user || !checkPassword(String(b.password ?? ''), user.passwordHash)) {
      brakes.set(req.ip, [...recent, now]);
      return fail(reply, ctx, 401, 'BAD_CREDENTIALS', 'err_login');
    }
    if (!user.verified) return fail(reply, ctx, 403, 'EMAIL_NOT_VERIFIED', 'err_unverified');
    return { token: store.issueToken(user) };
  });
}
