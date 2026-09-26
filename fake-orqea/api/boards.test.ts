import { describe, expect, it } from 'vitest';
import { makeFake, withBoard } from '../test-helpers/fake.js';
import { num } from './helpers.js';

describe('boards, lists and cards (Orqea paths and payloads)', () => {
  it('requires a token everywhere', async () => {
    const f = await makeFake();
    for (const [m, url] of [
      ['GET', '/api/boards'],
      ['POST', '/api/boards'],
      ['GET', '/api/boards/1'],
      ['GET', '/api/lists?board_id=1'],
      ['POST', '/api/lists'],
      ['POST', '/api/cards'],
      ['PUT', '/api/cards/1'],
      ['PATCH', '/api/cards/1'],
      ['POST', '/api/cards/1/checklist/items'],
      ['POST', '/api/cards/1/comments'],
    ] as const) {
      expect((await f.call(m, url)).json, `${m} ${url}`).toEqual({ message: 'No token provided' });
    }
  });

  it('creates a board with default lists, lists it, reads it; 404 for others', async () => {
    const { f, u, boardId, lists } = await withBoard();
    expect(lists.map((l) => l.title)).toEqual(['to do', 'in progress', 'done']);
    expect((await f.call('GET', '/api/boards', undefined, u.auth)).json).toEqual({
      owned: [{ id: boardId, title: 'Plan', owner_id: u.user.id }],
      memberOf: [],
    });
    expect((await f.call('GET', `/api/boards/${boardId}`, undefined, u.auth)).json).toMatchObject({
      board: { id: boardId },
      access: 'owner',
    });
    const other = await f.user('bob@example.com');
    expect((await f.call('GET', `/api/boards/${boardId}`, undefined, other.auth)).status).toBe(404);
    const bare = await f.call('POST', '/api/boards', { title: 'Empty' }, u.auth);
    const bareId = (bare.json.board as { id: number }).id;
    expect(
      (await f.call('GET', `/api/lists?board_id=${bareId}`, undefined, u.auth)).json.lists,
    ).toEqual([]);
    expect((await f.call('POST', '/api/boards', {}, u.auth)).json).toEqual({
      message: 'Missing or invalid title',
    });
  });

  it('PLAN_LIMIT (402) past the free board limit', async () => {
    const f = await makeFake({}, { boardLimit: 1 });
    const u = await f.user();
    expect((await f.call('POST', '/api/boards', { title: 'A' }, u.auth)).status).toBe(201);
    expect((await f.call('POST', '/api/boards', { title: 'B' }, u.auth)).json).toEqual({
      code: 'PLAN_LIMIT',
      limitKey: 'maxBoards',
      planKey: 'free',
      upgrade: true,
    });
    u.user.plan = 'pro';
    expect((await f.call('POST', '/api/boards', { title: 'B' }, u.auth)).status).toBe(201);
  });

  it('lists: query parameter required, board must be accessible', async () => {
    const { f, u, boardId } = await withBoard();
    expect((await f.call('GET', '/api/lists', undefined, u.auth)).status).toBe(400);
    expect((await f.call('GET', '/api/lists?board_id=999', undefined, u.auth)).status).toBe(404);
    const created = await f.call(
      'POST',
      '/api/lists',
      { title: 'Backlog', board_id: boardId },
      u.auth,
    );
    expect(created.status).toBe(201);
    expect(created.json.list).toMatchObject({ title: 'Backlog', position: 3, board_id: boardId });
    expect((await f.call('POST', '/api/lists', { board_id: boardId }, u.auth)).status).toBe(400);
    expect((await f.call('POST', '/api/lists', { title: 'X', board_id: 999 }, u.auth)).status).toBe(
      404,
    );
  });

  it('cards: create, update (title, description, move), 404 elsewhere', async () => {
    const { f, u, lists, cardId } = await withBoard();
    expect((await f.call('POST', '/api/cards', { list_id: lists[0]!.id }, u.auth)).status).toBe(
      400,
    );
    expect((await f.call('POST', '/api/cards', { title: 'X', list_id: 999 }, u.auth)).status).toBe(
      404,
    );
    const put = (body: object, id: number = cardId) =>
      f.call('PUT', `/api/cards/${id}`, body, u.auth);
    expect((await put({ title: ' New ', description: 'D' })).json.card).toMatchObject({
      title: 'New',
      description: 'D',
    });
    expect((await put({ title: ' ' })).json.card).toMatchObject({ title: 'New' });
    expect((await put({ list_id: String(lists[2]!.id) })).json.card).toMatchObject({
      list_id: lists[2]!.id,
    });
    expect((await put({ list_id: 999 })).status).toBe(404);
    expect((await put({}, 999)).status).toBe(404);
  });

  it('priority (PATCH priority_id), checklist items and comments', async () => {
    const { f, u, boardId, cardId } = await withBoard();
    const patch = (body: object, id: number = cardId) =>
      f.call('PATCH', `/api/cards/${id}`, body, u.auth);
    expect((await patch({ priority_id: 5 })).json).toEqual({
      message: 'Priority not found on this board',
    });
    const p = await f.call('POST', `/api/boards/${boardId}/priorities`, { title: 'High' }, u.auth);
    const pid = (p.json.priority as { id: number }).id;
    expect((await patch({ priority_id: String(pid) })).json.card).toMatchObject({
      priority_id: pid,
    });
    expect((await patch({})).status).toBe(200);
    expect((await patch({}, 999)).status).toBe(404);
    const item = (body: object, id: number = cardId) =>
      f.call('POST', `/api/cards/${id}/checklist/items`, body, u.auth);
    expect((await item({ title: 'Call' })).json.item).toMatchObject({ title: 'Call', done: false });
    expect((await item({})).status).toBe(400);
    expect((await item({ title: 'x' }, 999)).status).toBe(404);
    const comment = (body: object, id: number = cardId) =>
      f.call('POST', `/api/cards/${id}/comments`, body, u.auth);
    expect(typeof (await comment({ content: 'Hi' })).json.commentId).toBe('number');
    expect((await comment({})).status).toBe(400);
    expect((await comment({ content: 'x' }, 999)).status).toBe(404);
  });

  it('num() reads numbers and numeric strings only', () => {
    expect(num(3)).toBe(3);
    expect(num(' 4 ')).toBe(4);
    expect(num(undefined)).toBeNaN();
    expect(num({})).toBeNaN();
  });
});
