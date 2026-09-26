import type { FastifyInstance } from 'fastify';
import type { Deps } from '../context.js';
import type { Board, Card } from '../store.js';
import { boardJson, cardJson, helpers, listJson, num, str, type Helpers } from './helpers.js';

/** Orqea's `DEFAULT_LIST_TITLES` (`board_create.js`): created by `default_table`, not translated. */
export const DEFAULT_LISTS = ['to do', 'in progress', 'done'];

/** Boards, lists and cards: the paths and payloads of Orqea's routes (`routes/api/board|list|card`). */
export function boardsApi(app: FastifyInstance, deps: Deps): void {
  const h = helpers(deps);
  boards(app, h);
  listsAndCards(app, h);
  cardDetails(app, h);
}

function createBoard(h: Helpers, ownerId: number, title: string, lists: string[]): Board {
  const board: Board = {
    id: h.store.id(),
    ownerId,
    title,
    invitations: [],
    rules: [],
    // Fake-only: one label, so the web form path has something to attach (Orqea requires one).
    labels: [{ id: h.store.id(), title: 'Form' }],
    priorities: [],
  };
  h.store.boards.set(board.id, board);
  lists.forEach((t, position) => {
    const id = h.store.id();
    h.store.lists.set(id, { id, boardId: board.id, title: t, position });
  });
  return board;
}

function boards(app: FastifyInstance, h: Helpers): void {
  const { store, authed } = h;
  app.get('/api/boards', async (req, reply) => {
    const a = authed(req, reply);
    return a ? { owned: store.boardsOf(a.user.id).map(boardJson), memberOf: [] } : reply;
  });

  app.post('/api/boards', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const title = str(a.body.title);
    if (!title) return h.bad(reply, 'Missing or invalid title');
    if (a.user.plan === 'free' && store.boardsOf(a.user.id).length >= a.ctx.scenario.boardLimit) {
      return reply
        .code(402)
        .send({ code: 'PLAN_LIMIT', limitKey: 'maxBoards', planKey: 'free', upgrade: true });
    }
    const lists = [true, 'true', 1, '1'].includes(a.body.default_table as never)
      ? DEFAULT_LISTS
      : [];
    return reply.code(201).send({ board: boardJson(createBoard(h, a.user.id, title, lists)) });
  });

  app.get('/api/boards/:id', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const b = h.ownBoard(a.user, h.param(req, 'id'));
    return b ? { board: boardJson(b), access: 'owner' } : h.notFound(reply);
  });
}

function listsAndCards(app: FastifyInstance, h: Helpers): void {
  const { store, authed } = h;
  app.get('/api/lists', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const boardId = (req.query as Record<string, string | undefined>).board_id;
    if (!boardId) return h.bad(reply, 'Missing board_id query parameter');
    const b = h.ownBoard(a.user, boardId);
    return b ? { lists: store.listsOf(b.id).map(listJson) } : h.notFound(reply);
  });

  app.post('/api/lists', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const title = str(a.body.title);
    const b = h.ownBoard(a.user, a.body.board_id);
    if (!title) return h.bad(reply, 'Missing or invalid title');
    if (!b) return h.notFound(reply, 'Board not found or not accessible by user');
    const id = store.id();
    const list = { id, boardId: b.id, title, position: store.listsOf(b.id).length };
    store.lists.set(id, list);
    return reply.code(201).send({ list: listJson(list) });
  });

  app.post('/api/cards', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const title = str(a.body.title);
    if (!title) return h.bad(reply, 'Missing or invalid title');
    const list = h.ownList(a.user, a.body.list_id);
    if (!list) return h.notFound(reply, 'List not found or not accessible by user');
    const card: Card = {
      id: store.id(),
      listId: list.id,
      title,
      description: '',
      priorityId: null,
      complexity: null,
      checklist: [],
      comments: [],
    };
    store.cards.set(card.id, card);
    return reply.code(201).send({ card: cardJson(card) });
  });

  app.put('/api/cards/:id', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const card = h.ownCard(a.user, h.param(req, 'id'));
    if (!card) return h.notFound(reply);
    const { title, description, list_id } = a.body;
    if (typeof title === 'string' && title.trim()) card.title = title.trim();
    if (typeof description === 'string') card.description = description;
    if (list_id !== undefined) {
      const list = h.ownList(a.user, list_id);
      if (!list) return h.notFound(reply, 'List not found or not accessible by user');
      card.listId = list.id;
    }
    return { card: cardJson(card) };
  });
}

function cardDetails(app: FastifyInstance, h: Helpers): void {
  const { store, authed } = h;
  app.patch('/api/cards/:id', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const card = h.ownCard(a.user, h.param(req, 'id'));
    if (!card) return h.notFound(reply);
    if (a.body.priority_id !== undefined) {
      const board = store.boardOfCard(card);
      const p = board.priorities.find((x) => x.id === num(a.body.priority_id));
      if (!p) return h.bad(reply, 'Priority not found on this board');
      card.priorityId = p.id;
    }
    return { card: cardJson(card) };
  });

  app.post('/api/cards/:id/checklist/items', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const card = h.ownCard(a.user, h.param(req, 'id'));
    if (!card) return h.notFound(reply);
    const title = str(a.body.title);
    if (!title) return h.bad(reply, 'Missing or invalid title');
    const item = { id: store.id(), title, done: false };
    card.checklist.push(item);
    return reply.code(201).send({ item });
  });

  app.post('/api/cards/:id/comments', async (req, reply) => {
    const a = authed(req, reply);
    if (!a) return reply;
    const card = h.ownCard(a.user, h.param(req, 'id'));
    if (!card) return h.notFound(reply);
    const content = str(a.body.content);
    if (!content) return h.bad(reply, 'Missing or invalid content');
    const commentId = store.id();
    card.comments.push({ id: commentId, authorId: a.user.id, content });
    return reply.code(201).send({ commentId });
  });
}
