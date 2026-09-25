import { describe, expect, it } from 'vitest';
import { makeFake } from '../test-helpers/fake.js';

async function withBoard(scenario = {}, cfg = {}) {
  const f = await makeFake(cfg, scenario);
  const u = await f.user();
  const board = await f.call('POST', '/api/boards', { name: 'Plan' }, u.auth);
  const boardId = board.json.id as string;
  const detail = await f.call('GET', `/api/boards/${boardId}`, undefined, u.auth);
  const lists = detail.json.lists as { id: string; name: string }[];
  const card = await f.call(
    'POST',
    `/api/lists/${lists[0]!.id}/cards`,
    { title: 'Call Bob' },
    u.auth,
  );
  return { f, u, boardId, lists, cardId: card.json.id as string };
}

describe('product api', () => {
  it('requires authentication everywhere', async () => {
    const f = await makeFake();
    for (const [m, url] of [
      ['GET', '/api/me'],
      ['POST', '/api/onboarding/complete'],
      ['GET', '/api/boards'],
      ['POST', '/api/boards'],
      ['GET', '/api/boards/x'],
      ['POST', '/api/boards/x/lists'],
      ['POST', '/api/lists/x/cards'],
      ['PATCH', '/api/cards/x'],
      ['POST', '/api/cards/x/checklist'],
      ['POST', '/api/cards/x/comments'],
      ['POST', '/api/cards/bulk'],
      ['POST', '/api/boards/x/automations'],
      ['GET', '/api/calendar'],
      ['POST', '/api/notes'],
      ['POST', '/api/forms'],
      ['POST', '/api/qr'],
      ['GET', '/api/search'],
      ['PATCH', '/api/me/settings'],
      ['GET', '/api/export'],
      ['DELETE', '/api/me'],
      ['POST', '/api/billing/checkout'],
    ] as const) {
      expect((await f.call(m, url)).status, `${m} ${url}`).toBe(401);
    }
  });

  it('boards → lists → cards, with default lists in the user language', async () => {
    const { f, u, boardId, lists, cardId } = await withBoard();
    expect(lists.map((l) => l.name)).toEqual(['To do', 'Doing', 'Done']);
    expect((await f.call('GET', '/api/me', undefined, u.auth)).json).toMatchObject({
      plan: 'free',
    });
    expect((await f.call('POST', '/api/onboarding/complete', {}, u.auth)).json).toEqual({
      onboarded: true,
    });
    expect((await f.call('GET', '/api/boards', undefined, u.auth)).json.boards).toEqual([
      { id: boardId, name: 'Plan' },
    ]);
    expect(
      (await f.call('POST', `/api/boards/${boardId}/lists`, { name: 'Backlog' }, u.auth)).status,
    ).toBe(201);
    expect((await f.call('POST', `/api/boards/${boardId}/lists`, {}, u.auth)).status).toBe(400);
    expect((await f.call('POST', '/api/boards', {}, u.auth)).status).toBe(400);
    expect((await f.call('POST', `/api/lists/${lists[0]!.id}/cards`, {}, u.auth)).status).toBe(400);
    const patch = await f.call(
      'PATCH',
      `/api/cards/${cardId}`,
      { description: 'd', priority: 'high', listId: lists[2]!.id },
      u.auth,
    );
    expect(patch.json).toMatchObject({ priority: 'high', listId: lists[2]!.id });
    expect(
      (await f.call('PATCH', `/api/cards/${cardId}`, { priority: 'urgent' }, u.auth)).json.priority,
    ).toBe('high');
    expect((await f.call('PATCH', `/api/cards/${cardId}`, { listId: 'nope' }, u.auth)).status).toBe(
      404,
    );
    expect(
      (await f.call('POST', `/api/cards/${cardId}/checklist`, { text: 'x' }, u.auth)).json,
    ).toEqual({ count: 1 });
    expect((await f.call('POST', `/api/cards/${cardId}/checklist`, {}, u.auth)).status).toBe(400);
    const c = await f.call(
      'POST',
      `/api/cards/${cardId}/comments`,
      { text: 'hi @bob@example.com' },
      u.auth,
    );
    expect(c.json).toEqual({ count: 1, mentions: ['bob@example.com'] });
    expect(
      (await f.call('POST', `/api/cards/${cardId}/comments`, { text: ' ' }, u.auth)).status,
    ).toBe(400);
  });

  it('isolates users (404 on other people’s objects)', async () => {
    const { f, boardId, lists, cardId } = await withBoard();
    const eve = await f.user('eve@example.com');
    expect((await f.call('GET', `/api/boards/${boardId}`, undefined, eve.auth)).status).toBe(404);
    expect(
      (await f.call('POST', `/api/boards/${boardId}/lists`, { name: 'x' }, eve.auth)).status,
    ).toBe(404);
    expect(
      (await f.call('POST', `/api/lists/${lists[0]!.id}/cards`, { title: 'x' }, eve.auth)).status,
    ).toBe(404);
    expect((await f.call('POST', '/api/lists/none/cards', { title: 'x' }, eve.auth)).status).toBe(
      404,
    );
    expect((await f.call('PATCH', `/api/cards/${cardId}`, {}, eve.auth)).status).toBe(404);
    expect((await f.call('PATCH', '/api/cards/none', {}, eve.auth)).status).toBe(404);
    expect(
      (await f.call('POST', `/api/cards/${cardId}/checklist`, { text: 'x' }, eve.auth)).status,
    ).toBe(404);
    expect(
      (await f.call('POST', `/api/cards/${cardId}/comments`, { text: 'x' }, eve.auth)).status,
    ).toBe(404);
    expect((await f.call('POST', `/api/boards/${boardId}/automations`, {}, eve.auth)).status).toBe(
      404,
    );
    expect((await f.call('POST', `/api/boards/${boardId}/members`, {}, eve.auth)).status).toBe(404);
    expect((await f.call('POST', `/api/boards/${boardId}/guest-links`, {}, eve.auth)).status).toBe(
      404,
    );
    const evesBoard = await f.call('POST', '/api/boards', { name: 'E' }, eve.auth);
    const evesLists = (await f.call('GET', `/api/boards/${evesBoard.json.id}`, undefined, eve.auth))
      .json.lists as { id: string }[];
    const own = await f.call(
      'POST',
      `/api/lists/${evesLists[0]!.id}/cards`,
      { title: 'mine' },
      eve.auth,
    );
    const owner = await f.call(
      'PATCH',
      `/api/cards/${own.json.id}`,
      { listId: (await withBoard()).lists[0]!.id },
      eve.auth,
    );
    expect(owner.status).toBe(404);
    expect((await f.call('POST', '/api/cards/bulk', { cardIds: [cardId] }, eve.auth)).status).toBe(
      402,
    );
  });

  it('paywalls locked features with 402 and the plan limit on boards', async () => {
    const { f, u, boardId, cardId } = await withBoard({ boardLimit: 1 });
    expect((await f.call('POST', '/api/boards', { name: 'Two' }, u.auth)).json).toEqual({
      code: 'PLAN_LIMIT',
      limitKey: 'boards',
      planKey: 'pro',
      upgrade: true,
    });
    const locked = { code: 'FEATURE_LOCKED', planKey: 'pro', upgrade: true };
    expect((await f.call('POST', '/api/cards/bulk', { cardIds: [cardId] }, u.auth)).json).toEqual({
      ...locked,
      feature: 'bulk',
    });
    expect((await f.call('POST', `/api/boards/${boardId}/automations`, {}, u.auth)).json).toEqual({
      ...locked,
      feature: 'automation',
    });
    expect((await f.call('POST', '/api/qr', {}, u.auth)).status).toBe(402);
    expect((await f.call('GET', '/api/export', undefined, u.auth)).status).toBe(402);
  });

  it('unlocked features work for paying users', async () => {
    const { f, u, boardId, cardId } = await withBoard();
    u.user.plan = 'pro';
    expect(
      (
        await f.call(
          'POST',
          '/api/cards/bulk',
          { cardIds: [cardId, 'ghost'], action: 'priority' },
          u.auth,
        )
      ).json,
    ).toEqual({ updated: 1 });
    expect((await f.call('POST', '/api/cards/bulk', { cardIds: 'x' }, u.auth)).status).toBe(400);
    const rule = { name: 'r', trigger: 'card-moved-done', action: 'archive' };
    expect((await f.call('POST', `/api/boards/${boardId}/automations`, rule, u.auth)).status).toBe(
      201,
    );
    expect(
      (await f.call('POST', `/api/boards/${boardId}/automations`, { name: 'r' }, u.auth)).status,
    ).toBe(400);
    expect((await f.call('POST', '/api/qr', { url: 'https://example.org' }, u.auth)).status).toBe(
      201,
    );
    expect((await f.call('POST', '/api/qr', { url: 'ftp://x' }, u.auth)).status).toBe(400);
    expect((await f.call('GET', '/api/export', undefined, u.auth)).json).toMatchObject({
      boards: 1,
    });
  });

  it('members, guest links, notes, calendar, forms, search, settings', async () => {
    const { f, u, boardId } = await withBoard();
    expect(
      (await f.call('POST', `/api/boards/${boardId}/members`, { email: 'ann@example.com' }, u.auth))
        .json,
    ).toEqual({ invited: 'ann@example.com', hasAccount: true });
    expect(
      (await f.call('POST', `/api/boards/${boardId}/members`, { email: 'x' }, u.auth)).status,
    ).toBe(400);
    expect(
      (await f.call('POST', `/api/boards/${boardId}/guest-links`, {}, u.auth)).json.url,
    ).toMatch(/^\/guest\//);
    expect(
      (await f.call('POST', '/api/notes', { text: 'n', remindAt: '2030' }, u.auth)).status,
    ).toBe(201);
    expect((await f.call('POST', '/api/notes', { text: 'n' }, u.auth)).status).toBe(400);
    expect((await f.call('GET', '/api/calendar', undefined, u.auth)).json).toEqual({
      reminders: [{ text: 'n', at: '2030' }],
    });
    const form = await f.call('POST', '/api/forms', { title: 'T', questions: ['Q?'] }, u.auth);
    expect(form.json.publicUrl).toBe(`/f/${form.json.id}`);
    expect(
      (await f.call('POST', '/api/forms', { title: 'T', questions: 'Q' }, u.auth)).status,
    ).toBe(400);
    expect(
      (await f.call('POST', `/api/public/forms/${form.json.id}/answers`, { answers: ['A'] }))
        .status,
    ).toBe(201);
    expect((await f.call('POST', `/api/public/forms/${form.json.id}/answers`, {})).status).toBe(
      400,
    );
    expect((await f.call('POST', `/api/public/forms/${form.json.id}/answers`)).status).toBe(400);
    expect(
      (await f.call('POST', '/api/public/forms/none/answers', { answers: ['A'] })).status,
    ).toBe(404);
    expect((await f.call('GET', '/api/search?q=call', undefined, u.auth)).json.cards).toHaveLength(
      1,
    );
    expect((await f.call('GET', '/api/search', undefined, u.auth)).json.cards).toHaveLength(0);
    expect(
      (await f.call('PATCH', '/api/me/settings', { language: 'fr', theme: 'dark' }, u.auth)).json,
    ).toEqual({ language: 'fr', theme: 'dark' });
    expect(
      (await f.call('PATCH', '/api/me/settings', { language: 'de', theme: 'pink' }, u.auth)).json,
    ).toEqual({ language: 'fr', theme: 'dark' });
  });

  it('plans, test-mode checkout, account deletion', async () => {
    const { f, u } = await withBoard();
    const plans = (await f.call('GET', '/api/billing/plans')).json.plans as { key: string }[];
    expect(plans.map((p) => p.key)).toEqual(['free', 'pro', 'team']);
    expect(
      (await f.call('POST', '/api/billing/checkout', { planKey: 'pro' }, u.auth)).json,
    ).toEqual({ mode: 'test', planKey: 'pro', checkoutUrl: '/checkout' });
    expect(
      (await f.call('POST', '/api/billing/checkout', { planKey: 'free' }, u.auth)).status,
    ).toBe(400);
    expect((await f.call('DELETE', '/api/me', undefined, u.auth)).json).toEqual({ deleted: true });
    expect((await f.call('GET', '/api/me', undefined, u.auth)).status).toBe(401);
    const live = await makeFake({ stripeMode: 'live' });
    const lu = await live.user();
    expect(
      (await live.call('POST', '/api/billing/checkout', { planKey: 'pro' }, lu.auth)).status,
    ).toBe(409);
  });
});
