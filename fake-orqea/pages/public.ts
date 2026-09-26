import type { FastifyInstance } from 'fastify';
import type { Deps } from '../context.js';
import { apiForm, button, esc, field } from '../html.js';
import { EXTRA_FIELDS } from '../i18n.js';
import { verifyToken } from '../api/auth.js';
import { publicPage, query } from './route.js';

/** Landing, sign-up, email verification, sign-in and the public form: Orqea's routes and names. */
export function publicPages(app: FastifyInstance, deps: Deps): void {
  publicPage(app, deps, '/', ({ view: { t } }) => ({
    title: t('brand'),
    body: `<h1>${esc(t('tagline'))}</h1><p>${esc(t('pitch'))}</p><a href="/signup">${esc(t('tryBeta'))}</a> <a href="/login">${esc(t('signInLink'))}</a>`,
  }));

  publicPage(app, deps, '/signup', (ctx) => {
    const { t } = ctx.view;
    const s = ctx.scenario;
    const extras = EXTRA_FIELDS.slice(0, s.extraSignupFields)
      .map((k) => field(t(k), k, { required: true }))
      .join('');
    const captcha =
      s.captcha && !ctx.runId
        ? `<label><input type="checkbox" name="captcha"> ${esc(t('notRobot'))}</label>`
        : '';
    const terms = `<label><input type="checkbox" name="acceptedTerms" required data-invalid="${esc(t('err_terms'))}"> ${esc(t('terms'))}</label>`;
    const inner = `${field(t('username'), 'username')}
${field(t('email'), 'email', { type: 'email', required: true, extra: 'autocomplete="email"' })}
${field(t('password'), 'password', { type: 'password', required: true, extra: 'autocomplete="new-password"' })}${extras}
${terms}${captcha}${button(ctx.view, 'signupSubmit')}`;
    return {
      title: t('signupTitle'),
      body: `<h1>${esc(t('signupTitle'))}</h1>${apiForm('POST /api/auth/register', inner, { redirect: '/signup/done' })}`,
    };
  });

  // Orqea shows this for an account whose verification mail did not leave (always, for .invalid).
  publicPage(app, deps, '/signup/done', ({ view: { t } }) => ({
    title: t('signupTitle'),
    body: `<h1>${esc(t('signupTitle'))}</h1><p role="status">${esc(t('accountCreated'))}</p><a href="/login">${esc(t('signInLink'))}</a>`,
  }));

  // The web page the verification link opens (Orqea: FRONTEND_URL/verify-email?token=…).
  publicPage(app, deps, '/verify-email', ({ view: { t } }, req) => {
    const ok = verifyToken(deps.store, query(req).token) !== undefined;
    const text = ok ? t('emailVerified') : t('verifyFailed');
    return { title: text, body: `<h2>${esc(text)}</h2>`, status: ok ? 200 : 400 };
  });

  publicPage(app, deps, '/login', (ctx) => {
    const { t } = ctx.view;
    const inner = `${field(t('email'), 'email', { type: 'email', required: true, extra: 'autocomplete="email"' })}
${field(t('password'), 'password', { type: 'password', required: true, extra: 'autocomplete="current-password"' })}
${button(ctx.view, 'loginSubmit')}`;
    return {
      title: t('loginTitle'),
      body: `<h1>${esc(t('loginTitle'))}</h1>${apiForm('POST /api/auth/login', inner, { redirect: '/dashboard' })}`,
    };
  });

  publicPage(app, deps, '/forms/:token', (ctx, req) => {
    const { t } = ctx.view;
    const token = (req.params as Record<string, string>).token;
    const form = [...deps.store.forms.values()].find((f) => f.token === token);
    if (!form) return { title: t('notFound'), body: `<h1>${esc(t('notFound'))}</h1>`, status: 404 };
    const fields = form.config.fields
      .map((f) => field(f.label, `values.${f.id}`, { required: f.required }))
      .join('');
    return {
      title: form.title,
      body: `<h1>${esc(form.title)}</h1>${apiForm(`POST /api/forms/${form.token}/submit`, `${fields}${button(ctx.view, 'sendRequest')}`, { redirect: `/forms/${form.token}`, done: 'answer' })}`,
    };
  });
}
