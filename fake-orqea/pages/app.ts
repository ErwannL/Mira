import type { FastifyInstance } from 'fastify';
import type { Deps } from '../context.js';
import { apiForm, button, esc, field, select } from '../html.js';
import { PLANS } from '../api/plans.js';
import { appPage, query } from './route.js';

const QR_SVG =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path d="M0 0h2v2H0zM2 2h2v2H2z"/></svg>',
  ).toString('base64');

export function appPages(app: FastifyInstance, deps: Deps): void {
  appPages1(app, deps);
  appPages2(app, deps);
  appPages3(app, deps);
}

function appPages1(app: FastifyInstance, deps: Deps): void {
  const { store } = deps;
  appPage(app, deps, '/onboarding', (ctx) => {
    const { t } = ctx.view;
    const texts = ctx.scenario.longOnboarding
      ? [t('onboardingLong'), t('onboarding2'), t('onboarding3')]
      : [t('onboarding1'), t('onboarding2'), t('onboarding3')];
    const steps = texts
      .map((text, i) => {
        const last = i === texts.length - 1;
        const action = last
          ? apiForm('POST /api/onboarding/complete', button(ctx.view, 'finish'), {
              redirect: '/boards',
            })
          : `<button type="button" data-action="next">${esc(t('next'))}</button>`;
        return `<div data-step="${i}"${i > 0 ? ' hidden' : ''}><p>${esc(text)}</p>${action}</div>`;
      })
      .join('');
    return { title: t('welcome'), body: `<h1>${esc(t('welcome'))}</h1>${steps}` };
  });

  appPage(app, deps, '/calendar', (ctx, req) => {
    const { t } = ctx.view;
    const offset = Number(query(req).m ?? 0) || 0;
    const month = new Date(Date.UTC(2030, offset, 1)).toLocaleDateString(ctx.view.lang, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const reminders = [...store.notes.values()]
      .filter((n) => n.ownerId === ctx.user.id)
      .map((n) => `<li>${esc(n.remindAt)} — ${esc(n.text)}</li>`)
      .join('');
    return {
      title: t('calendar'),
      body: `<h1>${esc(t('calendar'))}</h1><p>${esc(month)}</p><form method="get"><input type="hidden" name="m" value="${offset + 1}"><button type="submit">${esc(t('nextMonth'))}</button></form><ul>${reminders}</ul>`,
    };
  });

  appPage(app, deps, '/notes', (ctx) => {
    const { t } = ctx.view;
    const inner = `${field(t('note'), 'text', { textarea: true, required: true })}${field(t('remindOn'), 'remindAt', { required: true })}${button(ctx.view, 'saveNote')}`;
    return {
      title: t('notes'),
      body: `<h1>${esc(t('notes'))}</h1>${apiForm('POST /api/notes', inner, { done: 'note' })}`,
    };
  });

  appPage(app, deps, '/forms', (ctx) => {
    const { t } = ctx.view;
    const forms = [...store.forms.values()]
      .filter((f) => f.ownerId === ctx.user.id)
      .map((f) => `<li>${esc(f.title)} — <a href="/f/${f.id}">${esc(t('publicLink'))}</a></li>`)
      .join('');
    const inner = `${field(t('formTitle'), 'title', { required: true })}${field(t('question'), 'questions', { required: true, extra: 'data-array' })}${button(ctx.view, 'createForm')}`;
    return {
      title: t('forms'),
      body: `<h1>${esc(t('forms'))}</h1><ul>${forms}</ul>${apiForm('POST /api/forms', inner, { done: 'form' })}`,
    };
  });
}

function appPages2(app: FastifyInstance, deps: Deps): void {
  const { store } = deps;
  appPage(app, deps, '/qr', (ctx, req) => {
    const { t } = ctx.view;
    const qr = store.qrs.get(query(req).id ?? '');
    const img =
      qr && qr.ownerId === ctx.user.id
        ? `<img src="${QR_SVG}" alt="${esc(t('qrCode'))}" width="160" height="160">`
        : '';
    const inner = `${field(t('linkToEncode'), 'url', { required: true })}${button(ctx.view, 'generateQr')}`;
    return {
      title: t('qr'),
      body: `<h1>${esc(t('qr'))}</h1>${img}${apiForm('POST /api/qr', inner, { redirect: '/qr?id={id}', done: 'qr' })}`,
    };
  });

  appPage(app, deps, '/search', (ctx, req) => {
    const { t } = ctx.view;
    const q = (query(req).q ?? '').toLowerCase();
    const mine = new Set(store.boardsOf(ctx.user.id).map((b) => b.id));
    const hits = [...store.cards.values()].filter(
      (c) => q && mine.has(store.boardOfCard(c).id) && c.title.toLowerCase().includes(q),
    );
    return {
      title: t('searchResults'),
      body: `<h1>${esc(t('searchResults'))}</h1><ul>${hits.map((c) => `<li><a href="/cards/${c.id}">${esc(c.title)}</a></li>`).join('')}</ul>`,
    };
  });

  appPage(app, deps, '/settings', (ctx) => {
    const { t } = ctx.view;
    const prefs = apiForm(
      'PATCH /api/me/settings',
      `${select(
        t('language'),
        'language',
        [
          ['en', 'English'],
          ['fr', 'Français'],
        ],
        ctx.user.language,
      )}
${select(
  t('theme'),
  'theme',
  [
    ['light', t('light')],
    ['dark', t('dark')],
  ],
  ctx.user.theme,
)}${button(ctx.view, 'saveSettings')}`,
      { done: 'settings' },
    );
    const exp = apiForm('GET /api/export', button(ctx.view, 'exportData'), { done: 'export' });
    const del = apiForm(
      'DELETE /api/me',
      `<label><input type="checkbox" name="confirm" required> ${esc(t('understand'))}</label>${button(ctx.view, 'deleteAccount')}`,
      { redirect: '/account-deleted' },
    );
    return { title: t('settings'), body: `<h1>${esc(t('settings'))}</h1>${prefs}${exp}${del}` };
  });
}

function appPages3(app: FastifyInstance, deps: Deps): void {
  appPage(app, deps, '/billing', (ctx) => {
    const { t } = ctx.view;
    const plans = PLANS.map((p) => {
      const price = `${p.priceMonthly} € ${p.perSeat ? t('perSeat') : t('perMonth')}`;
      const choose =
        p.priceMonthly > 0
          ? apiForm(
              'POST /api/billing/checkout',
              `<input type="hidden" name="planKey" value="${p.key}"><button type="submit">${esc(`${t('choose')} ${p.name}`)}</button>`,
              { redirect: '/checkout' },
            )
          : '';
      return `<article aria-label="${esc(p.name)}"><h2>${esc(p.name)}</h2><p>${esc(price)}</p><p>${esc(p.features.join(', '))}</p>${choose}</article>`;
    }).join('');
    return { title: t('plans'), body: `<h1>${esc(t('plans'))}</h1>${plans}` };
  });

  appPage(app, deps, '/checkout', ({ view: { t } }) => ({
    title: t('checkout'),
    body: `<h1>${esc(t('checkout'))}</h1><p>${esc(t('checkoutText'))}</p>`,
  }));
}
