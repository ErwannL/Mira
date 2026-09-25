import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ctxOf, fail, locked, paywall, type Ctx, type Deps } from '../context.js';
import type { Board, Card, User } from '../store.js';
import { PLANS } from './plans.js';

type Body = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const DEFAULT_LISTS = { en: ['To do', 'Doing', 'Done'], fr: ['À faire', 'En cours', 'Terminé'] };

export function productApi(app: FastifyInstance, deps: Deps): void {
  const { store } = deps;
  const authed = (req: FastifyRequest, reply: FastifyReply): { ctx: Ctx; user: User; body: Body } | null => {
    const ctx = ctxOf(req, deps);
    if (!ctx.user) {
      void reply.code(401).send({ error: 'UNAUTHENTICATED', message: 'Log in first.' });
      return null;
    }
    return { ctx, user: ctx.user, body: (req.body ?? {}) as Body };
  };
  const ownBoard = (user: User, id: string): Board | undefined => {
    const b = store.boards.get(id);
    return b && b.ownerId === user.id ? b : undefined;
  };
  const ownCard = (user: User, id: string): Card | undefined => {
    const c = store.cards.get(id);
    return c && store.boardOfCard(c).ownerId === user.id ? c : undefined;
  };
  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'NOT_FOUND', message: 'Not found.' });
  const required = (reply: FastifyReply, ctx: Ctx) => fail(reply, ctx, 400, 'MISSING_FIELD', 'err_required');
  const P = (req: FastifyRequest) => req.params as Record<string, string>;

  app.get('/api/me', async (req, reply) => {
    const a = authed(req, reply);
    return a ? { id: a.user.id, email: a.user.email, language: a.user.language, theme: a.user.theme, plan: a.user.plan } : reply;
  });
  app.post('/api/onboarding/complete', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    a.user.onboarded = true;
    return { onboarded: true };
  });

  app.get('/api/boards', async (req, reply) => {
    const a = authed(req, reply);
    return a ? { boards: store.boardsOf(a.user.id).map((b) => ({ id: b.id, name: b.name })) } : reply;
  });
  app.post('/api/boards', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const name = str(a.body.name);
    if (!name) return required(reply, a.ctx);
    if (a.user.plan === 'free' && store.boardsOf(a.user.id).length >= a.ctx.scenario.boardLimit) {
      return reply.code(402).send({ code: 'PLAN_LIMIT', limitKey: 'boards', planKey: 'pro', upgrade: true });
    }
    const board: Board = { id: store.id('b'), ownerId: a.user.id, name, members: [], guestLinks: [], rules: [] };
    store.boards.set(board.id, board);
    DEFAULT_LISTS[a.ctx.view.lang].forEach((n, i) => {
      const id = store.id('l');
      store.lists.set(id, { id, boardId: board.id, name: n, position: i });
    });
    return reply.code(201).send({ id: board.id, name });
  });
  app.get('/api/boards/:boardId', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const b = ownBoard(a.user, P(req).boardId as string);
    if (!b) return notFound(reply);
    const lists = store.listsOf(b.id).map((l) => ({ id: l.id, name: l.name, cards: store.cardsOf(l.id).map((c) => ({ id: c.id, title: c.title })) }));
    return { id: b.id, name: b.name, lists };
  });
  app.post('/api/boards/:boardId/lists', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const b = ownBoard(a.user, P(req).boardId as string);
    if (!b) return notFound(reply);
    const name = str(a.body.name);
    if (!name) return required(reply, a.ctx);
    const id = store.id('l');
    store.lists.set(id, { id, boardId: b.id, name, position: store.listsOf(b.id).length });
    return reply.code(201).send({ id, name });
  });
  app.post('/api/lists/:listId/cards', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const list = store.lists.get(P(req).listId as string);
    if (!list || !ownBoard(a.user, list.boardId)) return notFound(reply);
    const title = str(a.body.title);
    if (!title) return required(reply, a.ctx);
    const card: Card = { id: store.id('c'), listId: list.id, title, description: '', priority: 'medium', checklist: [], comments: [] };
    store.cards.set(card.id, card);
    return reply.code(201).send({ id: card.id, title });
  });
  app.patch('/api/cards/:cardId', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const card = ownCard(a.user, P(req).cardId as string);
    if (!card) return notFound(reply);
    const { description, priority, listId } = a.body;
    if (typeof description === 'string') card.description = description;
    if (priority === 'low' || priority === 'medium' || priority === 'high') card.priority = priority;
    if (typeof listId === 'string') {
      const list = store.lists.get(listId);
      if (!list || !ownBoard(a.user, list.boardId)) return notFound(reply);
      card.listId = list.id;
    }
    return { id: card.id, priority: card.priority, listId: card.listId };
  });
  app.post('/api/cards/:cardId/checklist', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const card = ownCard(a.user, P(req).cardId as string);
    if (!card) return notFound(reply);
    const text = str(a.body.text);
    if (!text) return required(reply, a.ctx);
    card.checklist.push({ text });
    return reply.code(201).send({ count: card.checklist.length });
  });
  app.post('/api/cards/:cardId/comments', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const card = ownCard(a.user, P(req).cardId as string);
    if (!card) return notFound(reply);
    const text = str(a.body.text);
    if (!text) return required(reply, a.ctx);
    const mentions = [...text.matchAll(/@(\S+)/g)].map((m) => m[1] as string);
    card.comments.push({ authorId: a.user.id, text, mentions });
    return reply.code(201).send({ count: card.comments.length, mentions });
  });
  app.post('/api/cards/bulk', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    if (locked(a.ctx, 'bulk')) return paywall(reply, a.ctx, 'bulk');
    const ids = Array.isArray(a.body.cardIds) ? a.body.cardIds.map(String) : [];
    const cards = ids.map((id) => ownCard(a.user, id)).filter((c): c is Card => c !== undefined);
    if (cards.length === 0) return required(reply, a.ctx);
    cards.forEach((c) => (c.priority = 'high'));
    return { updated: cards.length };
  });
  boardExtras(app, deps, { authed, ownBoard, notFound, required, P });
  personalApi(app, deps, { authed, required });
}

interface Helpers {
  authed: (req: FastifyRequest, reply: FastifyReply) => { ctx: Ctx; user: User; body: Body } | null;
  required: (reply: FastifyReply, ctx: Ctx) => FastifyReply;
}

function boardExtras(
  app: FastifyInstance,
  deps: Deps,
  h: Helpers & { ownBoard: (u: User, id: string) => Board | undefined; notFound: (r: FastifyReply) => FastifyReply; P: (r: FastifyRequest) => Record<string, string> },
): void {
  const withBoard = (req: FastifyRequest, reply: FastifyReply) => {
    const a = h.authed(req, reply);
    if (!a) return null;
    const board = h.ownBoard(a.user, h.P(req).boardId as string);
    if (!board) {
      void h.notFound(reply);
      return null;
    }
    return { ...a, board };
  };
  app.post('/api/boards/:boardId/automations', async (req, reply) => {
    const a = withBoard(req, reply);
    if (!a) return reply;
    if (locked(a.ctx, 'automation')) return paywall(reply, a.ctx, 'automation');
    const rule = { name: str(a.body.name), trigger: str(a.body.trigger), action: str(a.body.action) };
    if (!rule.name || !rule.trigger || !rule.action) return h.required(reply, a.ctx);
    a.board.rules.push(rule);
    return reply.code(201).send(rule);
  });
  app.post('/api/boards/:boardId/members', async (req, reply) => {
    const a = withBoard(req, reply);
    if (!a) return reply;
    const email = str(a.body.email);
    if (!email.includes('@')) return fail(reply, a.ctx, 400, 'INVALID_EMAIL', 'err_email');
    a.board.members.push(email);
    return reply.code(201).send({ invited: email, hasAccount: deps.store.userByEmail(email) !== undefined });
  });
  app.post('/api/boards/:boardId/guest-links', async (req, reply) => {
    const a = withBoard(req, reply);
    if (!a) return reply;
    const link = `/guest/${deps.store.id('g')}`;
    a.board.guestLinks.push(link);
    return reply.code(201).send({ url: link });
  });
}

function personalApi(app: FastifyInstance, deps: Deps, h: Helpers): void {
  const { store } = deps;
  app.get('/api/calendar', async (req, reply) => {
    const a = h.authed(req, reply);
    return !a ? reply : { reminders: [...store.notes.values()].filter((n) => n.ownerId === a.user.id).map((n) => ({ text: n.text, at: n.remindAt })) };
  });
  app.post('/api/notes', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    const text = str(a.body.text);
    const remindAt = str(a.body.remindAt);
    if (!text || !remindAt) return h.required(reply, a.ctx);
    const id = store.id('n');
    store.notes.set(id, { id, ownerId: a.user.id, text, remindAt });
    return reply.code(201).send({ id });
  });
  app.post('/api/forms', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    const title = str(a.body.title);
    const questions = Array.isArray(a.body.questions) ? a.body.questions.map(str).filter(Boolean) : [];
    if (!title || questions.length === 0) return h.required(reply, a.ctx);
    const id = store.id('f');
    store.forms.set(id, { id, ownerId: a.user.id, title, questions, answers: [] });
    return reply.code(201).send({ id, publicUrl: `/f/${id}` });
  });
  app.post('/api/public/forms/:formId/answers', async (req, reply) => {
    const form = store.forms.get((req.params as Record<string, string>).formId as string);
    const answers = (req.body as Body | undefined)?.answers;
    if (!form) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Not found.' });
    if (!Array.isArray(answers) || answers.length === 0) return h.required(reply, ctxOf(req, deps));
    form.answers.push(answers.map(String));
    return reply.code(201).send({ received: true });
  });
  app.post('/api/qr', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    if (locked(a.ctx, 'qr')) return paywall(reply, a.ctx, 'qr');
    const url = str(a.body.url);
    if (!/^https?:\/\//.test(url)) return h.required(reply, a.ctx);
    const id = store.id('q');
    store.qrs.set(id, { id, ownerId: a.user.id, url });
    return reply.code(201).send({ id });
  });
  app.get('/api/search', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    const q = String((req.query as Body).q ?? '').toLowerCase();
    const mine = new Set(store.boardsOf(a.user.id).map((b) => b.id));
    const hits = [...store.cards.values()].filter((c) => q && mine.has(store.boardOfCard(c).id) && c.title.toLowerCase().includes(q));
    return { cards: hits.map((c) => ({ id: c.id, title: c.title })) };
  });
  app.patch('/api/me/settings', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    if (a.body.language === 'en' || a.body.language === 'fr') a.user.language = a.body.language;
    if (a.body.theme === 'light' || a.body.theme === 'dark') a.user.theme = a.body.theme;
    return { language: a.user.language, theme: a.user.theme };
  });
  app.get('/api/export', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    if (locked(a.ctx, 'export')) return paywall(reply, a.ctx, 'export');
    return { boards: store.boardsOf(a.user.id).length, exportedAt: deps.config.nowS() };
  });
  app.delete('/api/me', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    store.deleteUsers((u) => u.id === a.user.id);
    return { deleted: true };
  });
  app.get('/api/billing/plans', async () => ({ plans: PLANS }));
  app.post('/api/billing/checkout', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    const plan = PLANS.find((p) => p.key === a.body.planKey && p.priceMonthly > 0);
    if (!plan) return h.required(reply, a.ctx);
    if (deps.config.stripeMode !== 'test') return reply.code(409).send({ error: 'CHECKOUT_DISABLED', message: 'Checkout is only available in test mode here.' });
    return { mode: 'test', planKey: plan.key, checkoutUrl: '/checkout' };
  });
}
