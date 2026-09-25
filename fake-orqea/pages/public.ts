import type { FastifyInstance } from 'fastify';
import type { Deps } from '../context.js';
import { apiForm, button, esc, field } from '../html.js';
import { EXTRA_FIELDS } from '../i18n.js';
import { publicPage } from './route.js';

export function publicPages(app: FastifyInstance, deps: Deps): void {
  publicPage(app, deps, '/', ({ view: { t } }) => ({
    title: t('brand'),
    body: `<h1>${esc(t('tagline'))}</h1><p>${esc(t('pitch'))}</p><a href="/signup">${esc(t('signUp'))}</a> <a href="/login">${esc(t('logIn'))}</a>`,
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
    const inner = `${field(t('email'), 'email', { required: true, extra: 'autocomplete="email" inputmode="email"' })}
${field(t('password'), 'password', { type: 'password', required: true, extra: 'autocomplete="new-password"' })}
${field(t('username'), 'username')}${extras}
<label><input type="checkbox" name="acceptedTerms"> ${esc(t('terms'))}</label>${captcha}
${button(ctx.view, 'createAccount')}`;
    return {
      title: t('createAccountTitle'),
      body: `<h1>${esc(t('createAccountTitle'))}</h1>${apiForm('POST /api/auth/register', inner, { redirect: '/signup/done' })}`,
    };
  });

  publicPage(app, deps, '/signup/done', ({ view: { t } }) => ({
    title: t('checkInbox'),
    body: `<h1>${esc(t('checkInbox'))}</h1><p>${esc(t('checkInboxText'))}</p>`,
  }));

  publicPage(app, deps, '/login', (ctx) => {
    const { t } = ctx.view;
    const inner = `${field(t('email'), 'email', { required: true, extra: 'autocomplete="email"' })}
${field(t('password'), 'password', { type: 'password', required: true, extra: 'autocomplete="current-password"' })}
${button(ctx.view, 'logIn')}`;
    return {
      title: t('logIn'),
      body: `<h1>${esc(t('logIn'))}</h1>${apiForm('POST /api/auth/login', inner, { redirect: '/boards' })}`,
    };
  });

  publicPage(app, deps, '/f/:formId', (ctx, req) => {
    const { t } = ctx.view;
    const form = deps.store.forms.get((req.params as Record<string, string>).formId as string);
    if (!form) return { title: t('notFound'), body: `<h1>${esc(t('notFound'))}</h1>`, status: 404 };
    const questions = form.questions
      .map(
        (q, i) =>
          `<p>${esc(q)}</p>${field(i === 0 ? t('yourAnswer') : `${t('yourAnswer')} ${i + 1}`, 'answers', { extra: 'data-array' })}`,
      )
      .join('');
    return {
      title: form.title,
      body: `<h1>${esc(form.title)}</h1>${apiForm(`POST /api/public/forms/${form.id}/answers`, `${questions}${button(ctx.view, 'send')}`, { redirect: `/f/${form.id}`, done: 'answer' })}`,
    };
  });

  publicPage(app, deps, '/account-deleted', ({ view: { t } }) => ({
    title: t('accountDeleted'),
    body: `<h1>${esc(t('accountDeleted'))}</h1>`,
  }));
}
