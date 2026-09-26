import type { FastifyInstance } from 'fastify';
import { locked, paywall, type Deps } from '../context.js';
import { checkPassword } from '../store.js';
import { cardJson, helpers, str, type Helpers } from './helpers.js';
import { PLANS } from './plans.js';

/** The account's own things: profile, preferences, notes, calendar, search, QR codes, billing. */
export function personalApi(app: FastifyInstance, deps: Deps): void {
  const h = helpers(deps);
  account(app, h);
  notesAndCalendar(app, h);
  qrAndForms(app, h);
  billing(app, deps, h);
}

function account(app: FastifyInstance, h: Helpers): void {
  const { authed, store } = h;
  app.get('/api/user/me', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const { id, email, username, language, theme } = a.user;
    return { id, email, username, plan: a.user.plan, preferences: { language, theme } };
  });

  app.patch('/api/user/me/preferences', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const { theme, language } = a.body;
    if (theme !== undefined && theme !== 'dark' && theme !== 'light')
      return h.bad(reply, 'Invalid theme value');
    if (typeof theme === 'string') a.user.theme = theme;
    // Orqea resolves any bundled locale; the fake only speaks en/fr.
    if (language === 'en' || language === 'fr') a.user.language = language;
    return { preferences: { language: a.user.language, theme: a.user.theme } };
  });

  app.post('/api/onboarding/checklist/dismiss', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    a.user.onboardingDismissed = a.body.dismissed !== false;
    return { dismissed: a.user.onboardingDismissed };
  });

  app.get('/api/user/me/export', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    return {
      user: { id: a.user.id, email: a.user.email },
      boards: store.boardsOf(a.user.id).length,
    };
  });

  app.delete('/api/user/me', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const password = str(a.body.password);
    if (!password)
      return reply
        .code(400)
        .send({ message: 'Password confirmation required', code: 'PASSWORD_REQUIRED' });
    if (!checkPassword(password, a.user.passwordHash))
      return reply.code(403).send({ message: 'Invalid password' });
    store.deleteUsers((u) => u.id === a.user.id);
    return { deleted: true };
  });
}

function notesAndCalendar(app: FastifyInstance, h: Helpers): void {
  const { authed, store } = h;
  app.post('/api/notes', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const content = str(a.body.content);
    const remindAt = a.body.remind_at === undefined ? null : str(a.body.remind_at);
    if (!content) return reply.code(400).send({ code: 'CONTENT_REQUIRED' });
    if (remindAt !== null && Number.isNaN(Date.parse(remindAt)))
      return reply.code(400).send({ code: 'INVALID_REMIND_AT' });
    const note = { id: store.id(), ownerId: a.user.id, content, remindAt };
    store.notes.set(note.id, note);
    return reply.code(201).send({ note: { id: note.id, content, remind_at: remindAt } });
  });

  // Gated at the mount in Orqea: requireFeature('advancedAnalytics') (apiIndex.js).
  app.get('/api/me/analytics/summary', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    if (locked(a.ctx, 'advancedAnalytics')) return paywall(reply, a.user.plan, 'advancedAnalytics');
    return { boards: store.boardsOf(a.user.id).length };
  });

  app.get('/api/calendar/user', async (req, reply) => {
    const a = authed(req, reply);
    return a ? { dated: [], undated: [] } : reply;
  });

  app.get('/api/search', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const q = String((req.query as Record<string, unknown>).q ?? '').toLowerCase();
    const mine = new Set(store.boardsOf(a.user.id).map((b) => b.id));
    const cards = [...store.cards.values()]
      .filter((c) => q && mine.has(store.boardOfCard(c).id) && c.title.toLowerCase().includes(q))
      .map((c) => ({ ...cardJson(c), board_id: store.boardOfCard(c).id }));
    return { cards, encryptedBoardsSkipped: 0 };
  });
}

function qrAndForms(app: FastifyInstance, h: Helpers): void {
  const { authed, store } = h;
  app.post('/api/qr-codes', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    if (locked(a.ctx, 'qrCodes')) return paywall(reply, a.user.plan, 'qrCodes');
    const label = str(a.body.label);
    const targetUrl = str(a.body.targetUrl);
    if (!label) return reply.code(400).send({ code: 'INVALID_LABEL' });
    if (!/^https?:\/\//.test(targetUrl)) return reply.code(400).send({ code: 'INVALID_TARGET' });
    const code = { id: store.id(), ownerId: a.user.id, label, targetUrl };
    store.qrs.set(code.id, code);
    return reply.code(201).send({ code: { id: code.id, label, targetUrl } });
  });

  app.post('/api/forms/:token/submit', async (req, reply) => {
    const form = [...store.forms.values()].find((f) => f.token === h.param(req, 'token'));
    const values = (req.body as Record<string, unknown> | undefined)?.values;
    if (!values || typeof values !== 'object') return h.bad(reply, 'Missing values in body');
    if (!form) return h.notFound(reply, 'Form not found');
    const v = values as Record<string, unknown>;
    const missing = form.config.fields.find((f) => f.required && !str(v[f.id]));
    if (missing) return reply.code(400).send({ code: 'FIELD_REQUIRED', field: missing.id });
    const card = {
      id: store.id(),
      listId: form.config.target_list_id,
      title: str(v[form.config.title_field]),
      description: '',
      priorityId: null,
      complexity: null,
      checklist: [],
      comments: [],
    };
    store.cards.set(card.id, card);
    return reply.code(201).send({ card: cardJson(card) });
  });
}

function billing(app: FastifyInstance, deps: Deps, h: Helpers): void {
  app.get('/api/billing/plans', async () => ({ plans: PLANS }));

  app.post('/api/billing/me/checkout', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    const plan = PLANS.find((p) => p.key === a.body.planKey && p.key !== 'free');
    if (!plan) return h.bad(reply, 'Invalid plan');
    if (plan.priceMonthly === null) return h.bad(reply, 'This plan is not purchasable yet');
    if (deps.config.stripeMode === 'off') return reply.code(403).send({ code: 'BILLING_DISABLED' });
    return { url: '/checkout', id: `cs_test_${plan.key}` };
  });
}
