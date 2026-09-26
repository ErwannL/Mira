import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { Deps } from '../context.js';
import type { Board, Form, FormField } from '../store.js';
import { helpers, num, str, type Authed, type Helpers } from './helpers.js';

/** Rule triggers and bulk operations the fake understands (a subset of Orqea's catalogues). */
export const TRIGGERS = ['card_created', 'card_moved', 'card_updated', 'comment_added'];
export const OPERATIONS = ['complexity.set', 'comment.add', 'checklist.addItem', 'move'];

/** Priorities, bulk plan, rules, members, labels and forms of a board. */
export function boardExtrasApi(app: FastifyInstance, deps: Deps): void {
  const h = helpers(deps);
  const withBoard = (req: FastifyRequest, reply: FastifyReply) => {
    const a = h.authed(req, reply);
    if (!a) return null;
    const board = h.ownBoard(a.user, h.param(req, 'boardId'));
    if (!board) {
      void h.notFound(reply, 'Board not found or not accessible by user');
      return null;
    }
    return { ...a, board };
  };
  prioritiesAndBulk(app, h, withBoard);
  rulesAndMembers(app, h, withBoard);
  labelsAndForms(app, h, withBoard);
}

type WithBoard = (req: FastifyRequest, reply: FastifyReply) => (Authed & { board: Board }) | null;

function prioritiesAndBulk(app: FastifyInstance, h: Helpers, withBoard: WithBoard): void {
  app.post('/api/boards/:boardId/priorities', async (req, reply) => {
    const a = withBoard(req, reply);
    if (!a) return reply;
    const title = str(a.body.title);
    if (!title) return h.bad(reply, 'Missing or invalid title');
    const priority = { id: h.store.id(), title };
    a.board.priorities.push(priority);
    return reply.code(201).send({ priority: { ...priority, board_id: a.board.id } });
  });

  app.post('/api/cards/bulk', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    const ids = Array.isArray(a.body.card_ids) ? a.body.card_ids.map(num) : [];
    const ops = Array.isArray(a.body.operations) ? (a.body.operations as { type?: unknown }[]) : [];
    if (ids.length === 0)
      return reply.code(400).send({ message: 'card_ids required', field: 'card_ids' });
    if (ops.length === 0 || ops.some((o) => !OPERATIONS.includes(str(o.type))))
      return reply.code(400).send({ message: 'Invalid operations', field: 'operations' });
    const cards = ids.map((id) => h.ownCard(a.user, id));
    if (cards.some((c) => c === undefined))
      return h.notFound(reply, 'Some cards are not accessible');
    for (const c of cards) {
      for (const op of ops as Record<string, unknown>[])
        if (op.type === 'complexity.set') c!.complexity = str(op.complexity) || null;
    }
    return { results: ops.map((o) => ({ type: o.type, affected: cards.length })) };
  });
}

function rulesAndMembers(app: FastifyInstance, h: Helpers, withBoard: WithBoard): void {
  app.post('/api/boards/:boardId/rules', async (req, reply) => {
    const a = withBoard(req, reply);
    if (!a) return reply;
    const name = str(a.body.name);
    const trigger = a.body.trigger as { type?: unknown } | undefined;
    const actions = Array.isArray(a.body.actions) ? (a.body.actions as { type: string }[]) : [];
    // Orqea's rule errors are codes with the field (`ruleCatalog.js`), no message.
    if (!name) return reply.code(400).send({ code: 'NAME_REQUIRED', field: 'name' });
    if (!trigger || !TRIGGERS.includes(str(trigger.type)))
      return reply.code(400).send({ code: 'UNKNOWN_TRIGGER', field: 'trigger' });
    if (actions.length === 0) return reply.code(400).send({ code: 'NO_ACTIONS', field: 'actions' });
    const rule = { id: h.store.id(), name, trigger: { type: str(trigger.type) }, actions };
    a.board.rules.push(rule);
    return reply.code(201).send({ rule });
  });

  app.post('/api/boards/:id/members', async (req, reply) => {
    const a = h.authed(req, reply);
    if (!a) return reply;
    const board = h.ownBoard(a.user, h.param(req, 'id'));
    if (!board) return h.notFound(reply, 'Board not found');
    const email = str(a.body.email).toLowerCase();
    if (!email.includes('@')) return h.bad(reply, 'Invalid email');
    if (board.invitations.includes(email))
      return reply.code(409).send({ message: 'An invitation is already pending for this user.' });
    board.invitations.push(email);
    return reply.code(201).send({
      invitation: { id: h.store.id(), email, board_id: board.id },
      emailDelivery: 'queued',
    });
  });
}

function labelsAndForms(app: FastifyInstance, h: Helpers, withBoard: WithBoard): void {
  app.post('/api/boards/:boardId/labels', async (req, reply) => {
    const a = withBoard(req, reply);
    if (!a) return reply;
    const title = str(a.body.title);
    if (!title) return h.bad(reply, 'Missing or invalid title');
    const label = { id: h.store.id(), title };
    a.board.labels.push(label);
    return reply.code(201).send({ label: { ...label, board_id: a.board.id } });
  });

  app.post('/api/boards/:boardId/forms', async (req, reply) => {
    const a = withBoard(req, reply);
    if (!a) return reply;
    const title = str(a.body.title);
    if (!title) return h.bad(reply, 'Missing or invalid title');
    const config = formConfig(a.board, a.body.config, h);
    if (typeof config === 'string')
      return reply.code(400).send({ code: config, field: 'config', message: config });
    const form: Form = {
      id: h.store.id(),
      boardId: a.board.id,
      ownerId: a.user.id,
      title,
      token: randomBytes(16).toString('hex'),
      config,
    };
    h.store.forms.set(form.id, form);
    const json = { id: form.id, board_id: form.boardId, title, public_token: form.token, config };
    return reply.code(201).send({ form: json, public_link: `/forms/${form.token}` });
  });
}

/** Orqea's `normalizeFormConfig` checks, in its order; returns the error code or the config. */
export function formConfig(board: Board, raw: unknown, h: Helpers): Form['config'] | string {
  if (raw === null || typeof raw !== 'object') return 'CONFIG_INVALID';
  const c = raw as Record<string, unknown>;
  const list = h.store.lists.get(num(c.target_list_id));
  if (!list || list.boardId !== board.id) return 'TARGET_LIST_REQUIRED';
  const labelIds = (Array.isArray(c.label_ids) ? c.label_ids : []).map(num);
  if (labelIds.length === 0 || labelIds.some((id) => !board.labels.some((l) => l.id === id)))
    return 'LABELS_REQUIRED';
  const fields = (Array.isArray(c.fields) ? c.fields : []) as Partial<FormField>[];
  if (fields.length === 0) return 'FIELDS_REQUIRED';
  if (fields.some((f) => !/^[a-zA-Z0-9_-]{1,40}$/.test(str(f.id)) || !str(f.label)))
    return 'FIELD_INVALID';
  if (!fields.some((f) => f.id === c.title_field)) return 'TITLE_FIELD_REQUIRED';
  return {
    target_list_id: list.id,
    label_ids: labelIds,
    fields: fields.map((f) => ({
      id: str(f.id),
      type: str(f.type) || 'text',
      label: str(f.label),
      required: f.required === true,
    })),
    title_field: str(c.title_field),
  };
}
