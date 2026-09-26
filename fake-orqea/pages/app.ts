import type { FastifyInstance } from 'fastify';
import { locked, type Ctx, type Deps } from '../context.js';
import { apiForm, button, esc, field, toggle } from '../html.js';
import { PLANS } from '../api/plans.js';
import type { User } from '../store.js';
import { appPage, query } from './route.js';

export function appPages(app: FastifyInstance, deps: Deps): void {
  homePages(app, deps);
  accountPages(app, deps);
  billingPages(app, deps);
}

function gettingStarted(ctx: Ctx & { user: User }): string {
  const { t } = ctx.view;
  if (ctx.user.onboardingDismissed) return '';
  const text = ctx.scenario.longOnboarding ? t('gettingStartedLong') : t('gettingStartedBody');
  const hide = apiForm(
    'POST /api/onboarding/checklist/dismiss',
    button(ctx.view, 'hideGettingStarted'),
  );
  return `<section aria-label="${esc(t('gettingStarted'))}"><h2>${esc(t('gettingStarted'))}</h2><p>${esc(text)}</p>${hide}</section>`;
}

function homePages(app: FastifyInstance, deps: Deps): void {
  appPage(app, deps, '/dashboard', (ctx) => {
    const { t } = ctx.view;
    // Orqea's empty state (BoardEmptyState): the creation form is on the page, no modal.
    const empty =
      ctx.view.boards.length > 0
        ? ''
        : `<h2>${esc(t('emptyTitle'))}</h2>${apiForm(
            'POST /api/boards',
            `${field(t('boardName'), 'title', { required: true })}<input type="hidden" name="default_table" value="true">${button(ctx.view, 'createBoard')}`,
            { redirect: '/board/{board.id}' },
          )}`;
    return { title: t('home'), body: `${gettingStarted(ctx)}${empty}` };
  });

  // Orqea gates /stats in the browser (RequireFeature): a lock screen, and no 402 on the wire.
  appPage(app, deps, '/stats', (ctx) => {
    const { t } = ctx.view;
    const title = locked(ctx, 'advancedAnalytics') ? t('statsLocked') : t('statsTitle');
    return { title, body: `<h1>${esc(title)}</h1>` };
  });

  appPage(app, deps, '/calendar', ({ view: { t } }) => ({
    title: t('calendar'),
    body: `<h1>${esc(t('calendarTitle'))}</h1>`,
  }));

  appPage(app, deps, '/qr', (ctx) => {
    const { t } = ctx.view;
    const codes = [...deps.store.qrs.values()]
      .filter((q) => q.ownerId === ctx.user.id)
      .map((q) => `<li>${esc(q.label)}</li>`)
      .join('');
    const inner = `${field(t('codeName'), 'label', { required: true })}${field(t('destination'), 'targetUrl', { required: true })}${button(ctx.view, 'createCode')}`;
    return {
      title: t('qr'),
      body: `<h1>${esc(t('qr'))}</h1><ul>${codes}</ul>${apiForm('POST /api/qr-codes', inner, { redirect: '/qr' })}`,
    };
  });
}

function accountPages(app: FastifyInstance, deps: Deps): void {
  appPage(app, deps, '/settings', (ctx, req) => {
    const { t } = ctx.view;
    const v = ctx.view;
    const theme = (value: 'dark' | 'light') =>
      apiForm(
        'PATCH /api/user/me/preferences',
        `<input type="hidden" name="theme" value="${value}"><button type="submit" aria-label="${esc(t(value === 'dark' ? 'darkAria' : 'lightAria'))}">${esc(t(value))}</button>`,
        { redirect: '/settings?tab=preferences', done: 'settings' },
      );
    const confirm = apiForm(
      'DELETE /api/user/me',
      `<label for="delete-confirm-input">${esc(t('deleteConfirmLabel'))}</label><input id="delete-confirm-input" type="password" name="password" required>${button(v, 'confirmDeletion')}`,
      { redirect: '/', id: 'delete-confirm', hidden: v.open !== 'delete-confirm' },
    );
    const privacy = `<h2>${esc(t('exportTitle'))}</h2>${apiForm('GET /api/user/me/export', button(v, 'exportButton'), { redirect: '/settings?tab=privacy', done: 'export' })}
<h2>${esc(t('deleteTitle'))}</h2>${toggle(t('deleteButton'), 'delete-confirm')}${confirm}`;
    const tab =
      query(req).tab === 'privacy'
        ? privacy
        : `<h2>${esc(t('theme'))}</h2>${theme('dark')}${theme('light')}`;
    return { title: t('settings'), body: `<h1>${esc(t('settings'))}</h1>${tab}` };
  });

  appPage(app, deps, '/profile', (ctx) => {
    const { t } = ctx.view;
    // Orqea's "Preferred language" is a custom dropdown whose label is not tied to a control:
    // the select below has no accessible name on purpose (docs/ORQEA_UI_FACTS.md).
    const form = apiForm(
      'PATCH /api/user/me/preferences',
      `<p>${esc(t('preferredLanguage'))}</p><select name="language"><option value="en">English</option><option value="fr">Français</option></select>${button(ctx.view, 'save')}`,
      { redirect: '/profile', id: 'profile-edit', hidden: ctx.view.open !== 'profile-edit' },
    );
    return {
      title: t('profile'),
      body: `<h1>${esc(t('profile'))}</h1><p>${esc(ctx.user.username)}</p>${toggle(t('edit'), 'profile-edit')}${form}`,
    };
  });
}

function billingPages(app: FastifyInstance, deps: Deps): void {
  appPage(app, deps, '/billing', (ctx) => {
    const { t } = ctx.view;
    const plans = PLANS.map((p) => {
      const price =
        p.priceMonthly === null ? t('contactUs') : `$${p.priceMonthly}/${t('perMonth')}`;
      const choose =
        p.priceMonthly === null || p.priceMonthly === 0
          ? ''
          : apiForm(
              'POST /api/billing/me/checkout',
              `<input type="hidden" name="planKey" value="${p.key}"><input type="hidden" name="interval" value="month"><button type="submit">${esc(`${t('choose')} ${p.name}`)}</button>`,
              { redirect: '{url}' },
            );
      return `<article aria-label="${esc(p.name)}"><h2>${esc(p.name)}</h2><p>${esc(price)}</p><p>${esc(p.features.join(', '))}</p>${choose}</article>`;
    }).join('');
    return { title: t('billing'), body: `<h1>${esc(t('billing'))}</h1>${plans}` };
  });

  appPage(app, deps, '/checkout', () => ({
    title: 'Checkout',
    body: '<h1>Checkout (Stripe test mode)</h1><p>No money moves.</p>',
  }));
}
