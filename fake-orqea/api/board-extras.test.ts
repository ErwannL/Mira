import { describe, expect, it } from 'vitest';
import { makeFake, withBoard } from '../test-helpers/fake.js';
import { formConfig } from './board-extras.js';
import { helpers } from './helpers.js';

describe('board extras (priorities, bulk, rules, members, labels, forms)', () => {
  it('requires a token and an accessible board', async () => {
    const f = await makeFake();
    for (const [m, url] of [
      ['POST', '/api/boards/1/priorities'],
      ['POST', '/api/cards/bulk'],
      ['POST', '/api/boards/1/rules'],
      ['POST', '/api/boards/1/members'],
      ['POST', '/api/boards/1/labels'],
      ['POST', '/api/boards/1/forms'],
    ] as const)
      expect((await f.call(m, url)).status, url).toBe(401);
    const { f: g, u } = await withBoard();
    for (const url of ['/api/boards/999/priorities', '/api/boards/999/rules'])
      expect((await g.call('POST', url, {}, u.auth)).status).toBe(404);
    expect((await g.call('POST', '/api/boards/999/members', {}, u.auth)).status).toBe(404);
  });

  it('priorities', async () => {
    const { f, u, boardId } = await withBoard();
    const url = `/api/boards/${boardId}/priorities`;
    expect((await f.call('POST', url, { title: 'High' }, u.auth)).json.priority).toMatchObject({
      title: 'High',
      board_id: boardId,
    });
    expect((await f.call('POST', url, {}, u.auth)).status).toBe(400);
  });

  it('bulk: {card_ids, operations}, validated before anything changes', async () => {
    const { f, u, cardId } = await withBoard();
    const bulk = (body?: object) => f.call('POST', '/api/cards/bulk', body, u.auth);
    const op = { type: 'complexity.set', complexity: 'high' };
    const ok = await bulk({ card_ids: [String(cardId)], operations: [op] });
    expect(ok.json).toEqual({ results: [{ type: 'complexity.set', affected: 1 }] });
    expect(f.deps.store.cards.get(cardId)!.complexity).toBe('high');
    await bulk({ card_ids: [cardId], operations: [{ type: 'complexity.set' }] });
    expect(f.deps.store.cards.get(cardId)!.complexity).toBeNull();
    await bulk({ card_ids: [cardId], operations: [{ type: 'comment.add', text: 'x' }] });
    expect((await bulk()).json).toMatchObject({ field: 'card_ids' });
    expect((await bulk({ card_ids: [cardId] })).json).toMatchObject({ field: 'operations' });
    expect((await bulk({ card_ids: [cardId], operations: [{ type: 'delete' }] })).status).toBe(400);
    expect((await bulk({ card_ids: [999], operations: [op] })).status).toBe(404);
  });

  it('rules: Orqea error codes with the field', async () => {
    const { f, u, boardId } = await withBoard();
    const rule = (body: object) => f.call('POST', `/api/boards/${boardId}/rules`, body, u.auth);
    const good = {
      name: 'Light',
      trigger: { type: 'card_created' },
      actions: [{ type: 'complexity.set', complexity: 'light' }],
    };
    expect((await rule(good)).json.rule).toMatchObject({ name: 'Light' });
    expect((await rule({ ...good, name: '' })).json).toEqual({
      code: 'NAME_REQUIRED',
      field: 'name',
    });
    expect((await rule({ ...good, trigger: undefined })).json).toMatchObject({
      code: 'UNKNOWN_TRIGGER',
    });
    expect((await rule({ ...good, trigger: { type: 'x' } })).json.code).toBe('UNKNOWN_TRIGGER');
    expect((await rule({ ...good, actions: undefined })).json.code).toBe('NO_ACTIONS');
  });

  it('members: invitation (201, emailDelivery), duplicate 409, bad email 400', async () => {
    const { f, u, boardId } = await withBoard();
    const invite = (email?: string) =>
      f.call('POST', `/api/boards/${boardId}/members`, { email }, u.auth);
    const r = await invite('Guest@Example.com');
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      invitation: { email: 'guest@example.com' },
      emailDelivery: 'queued',
    });
    expect((await invite('guest@example.com')).status).toBe(409);
    expect((await invite()).status).toBe(400);
  });

  it('labels and forms (Orqea normalizeFormConfig order), public link', async () => {
    const { f, u, boardId, lists } = await withBoard();
    const label = await f.call('POST', `/api/boards/${boardId}/labels`, { title: 'L' }, u.auth);
    const labelId = (label.json.label as { id: number }).id;
    expect((await f.call('POST', `/api/boards/${boardId}/labels`, {}, u.auth)).status).toBe(400);
    const form = (body: object) => f.call('POST', `/api/boards/${boardId}/forms`, body, u.auth);
    const config = {
      target_list_id: String(lists[0]!.id),
      label_ids: [String(labelId)],
      fields: [{ id: 'name', label: 'Your name?', required: true }],
      title_field: 'name',
    };
    const ok = await form({ title: 'Reg', config });
    expect(ok.status).toBe(201);
    const token = (ok.json.form as { public_token: string }).public_token;
    expect(ok.json.public_link).toBe(`/forms/${token}`);
    expect(
      (ok.json.form as { config: { fields: { type: string }[] } }).config.fields[0]!.type,
    ).toBe('text');
    expect((await form({ config })).status).toBe(400);
    expect((await form({ title: 'Reg', config: null })).json.code).toBe('CONFIG_INVALID');
  });

  it('formConfig refuses each missing piece in turn', async () => {
    const { f, boardId, lists } = await withBoard();
    const h = helpers(f.deps);
    const board = f.deps.store.boards.get(boardId)!;
    const labelId = board.labels[0]!.id;
    const base = {
      target_list_id: lists[0]!.id,
      label_ids: [labelId],
      fields: [{ id: 'n', label: 'N', type: 'text' }],
      title_field: 'n',
    };
    const code = (c: object) => formConfig(board, { ...base, ...c }, h);
    expect(code({})).toMatchObject({ title_field: 'n' });
    expect(code({ target_list_id: 999 })).toBe('TARGET_LIST_REQUIRED');
    const other = f.deps.store.lists.get(lists[0]!.id)!;
    expect(formConfig({ ...board, id: -1 }, base, h)).toBe('TARGET_LIST_REQUIRED');
    expect(other.boardId).toBe(boardId);
    expect(code({ label_ids: undefined })).toBe('LABELS_REQUIRED');
    expect(code({ label_ids: [999] })).toBe('LABELS_REQUIRED');
    expect(code({ fields: undefined })).toBe('FIELDS_REQUIRED');
    expect(code({ fields: [{ id: 'bad id', label: 'x' }] })).toBe('FIELD_INVALID');
    expect(code({ fields: [{ id: 'n' }] })).toBe('FIELD_INVALID');
    expect(code({ title_field: 'other' })).toBe('TITLE_FIELD_REQUIRED');
    expect(formConfig(board, 'x', h)).toBe('CONFIG_INVALID');
  });
});
