import { describe, expect, it } from 'vitest';
import { flattenEndpoints } from '../../worker/target/client.js';
import { plansResponseSchema } from '../../shared/plans.js';
import { makeFake, withBoard } from '../test-helpers/fake.js';
import { describeApi } from './descriptor.js';
import { PLANS } from './plans.js';

describe('personal api (profile, preferences, notes, calendar, search, QR, forms, billing)', () => {
  it('requires a token', async () => {
    const f = await makeFake();
    for (const [m, url] of [
      ['GET', '/api/user/me'],
      ['PATCH', '/api/user/me/preferences'],
      ['POST', '/api/onboarding/checklist/dismiss'],
      ['GET', '/api/user/me/export'],
      ['DELETE', '/api/user/me'],
      ['POST', '/api/notes'],
      ['GET', '/api/calendar/user'],
      ['GET', '/api/search?q=x'],
      ['POST', '/api/qr-codes'],
      ['POST', '/api/billing/me/checkout'],
    ] as const)
      expect((await f.call(m, url)).status, url).toBe(401);
  });

  it('profile, preferences, onboarding checklist, export', async () => {
    const f = await makeFake();
    const u = await f.user();
    expect((await f.call('GET', '/api/user/me', undefined, u.auth)).json).toMatchObject({
      username: 'ann',
      preferences: { language: 'en', theme: 'dark' },
    });
    const prefs = (body: object) => f.call('PATCH', '/api/user/me/preferences', body, u.auth);
    expect((await prefs({ theme: 'light', language: 'fr' })).json).toEqual({
      preferences: { language: 'fr', theme: 'light' },
    });
    expect((await prefs({ language: 'de' })).json).toEqual({
      preferences: { language: 'fr', theme: 'light' },
    });
    expect((await prefs({ theme: 'pink' })).status).toBe(400);
    const dismiss = (body?: object) =>
      f.call('POST', '/api/onboarding/checklist/dismiss', body, u.auth);
    expect((await dismiss()).json).toEqual({ dismissed: true });
    expect((await dismiss({ dismissed: false })).json).toEqual({ dismissed: false });
    expect((await f.call('GET', '/api/user/me/export', undefined, u.auth)).json).toMatchObject({
      boards: 0,
    });
  });

  it('account deletion needs the password (Orqea checkDeletionConfirmation)', async () => {
    const f = await makeFake();
    const u = await f.user();
    const del = (body?: object) => f.call('DELETE', '/api/user/me', body, u.auth);
    expect((await del()).json).toMatchObject({ code: 'PASSWORD_REQUIRED' });
    expect((await del({ password: 'nope' })).status).toBe(403);
    expect((await del({ password: 'Str0ngPassword1!' })).json).toEqual({ deleted: true });
    expect(f.deps.store.userByEmail('ann@example.com')).toBeUndefined();
  });

  it('notes, calendar and search', async () => {
    const { f, u } = await withBoard();
    const note = (body: object) => f.call('POST', '/api/notes', body, u.auth);
    expect((await note({ content: 'Flour', remind_at: '2030-01-15T09:00:00Z' })).json.note).toEqual(
      {
        id: expect.any(Number),
        content: 'Flour',
        remind_at: '2030-01-15T09:00:00Z',
      },
    );
    expect((await note({ content: 'No reminder' })).status).toBe(201);
    expect((await note({})).json).toEqual({ code: 'CONTENT_REQUIRED' });
    expect((await note({ content: 'x', remind_at: 'soon' })).json).toEqual({
      code: 'INVALID_REMIND_AT',
    });
    expect((await f.call('GET', '/api/calendar/user', undefined, u.auth)).json).toEqual({
      dated: [],
      undated: [],
    });
    const search = async (q: string) =>
      (await f.call('GET', `/api/search${q}`, undefined, u.auth)).json;
    expect(((await search('?q=call')).cards as unknown[]).length).toBe(1);
    expect(await search('')).toEqual({ cards: [], encryptedBoardsSkipped: 0 });
  });

  it('statistics: paywalled on free (402, advancedAnalytics), served on a paid plan', async () => {
    const f = await makeFake();
    const u = await f.user();
    const stats = () => f.call('GET', '/api/me/analytics/summary', undefined, u.auth);
    expect((await stats()).json).toEqual({
      code: 'FEATURE_LOCKED',
      feature: 'advancedAnalytics',
      planKey: 'free',
      upgrade: true,
    });
    u.user.plan = 'pro';
    expect((await stats()).json).toEqual({ boards: 0 });
    expect((await f.call('GET', '/api/me/analytics/summary')).status).toBe(401);
  });

  it('QR codes: paywalled on free (402), validated otherwise', async () => {
    const f = await makeFake();
    const u = await f.user();
    const qr = (body: object) => f.call('POST', '/api/qr-codes', body, u.auth);
    expect((await qr({ label: 'P', targetUrl: 'https://e.org' })).json).toEqual({
      code: 'FEATURE_LOCKED',
      feature: 'qrCodes',
      planKey: 'free',
      upgrade: true,
    });
    u.user.plan = 'pro';
    expect((await qr({ label: 'P', targetUrl: 'https://e.org' })).status).toBe(201);
    expect((await qr({ targetUrl: 'https://e.org' })).json).toEqual({ code: 'INVALID_LABEL' });
    expect((await qr({ label: 'P', targetUrl: 'ftp://e' })).json).toEqual({
      code: 'INVALID_TARGET',
    });
  });

  it('public form submission creates a card; required fields enforced', async () => {
    const { f, u, boardId, lists } = await withBoard();
    const board = f.deps.store.boards.get(boardId)!;
    const created = await f.call(
      'POST',
      `/api/boards/${boardId}/forms`,
      {
        title: 'Reg',
        config: {
          target_list_id: lists[0]!.id,
          label_ids: [board.labels[0]!.id],
          fields: [{ id: 'name', label: 'Name', required: true }],
          title_field: 'name',
        },
      },
      u.auth,
    );
    const token = (created.json.form as { public_token: string }).public_token;
    const submit = (body?: object, t = token) => f.call('POST', `/api/forms/${t}/submit`, body);
    expect((await submit({ values: { name: 'Dominique' } })).json.card).toMatchObject({
      title: 'Dominique',
    });
    expect((await submit({ values: {} })).json).toEqual({ code: 'FIELD_REQUIRED', field: 'name' });
    expect((await submit()).status).toBe(400);
    expect((await submit({ values: {} }, 'nope')).status).toBe(404);
  });

  it("plans in Orqea's shape, parsed by Figura; checkout rules", async () => {
    const f = await makeFake();
    const body = (await f.call('GET', '/api/billing/plans')).json;
    const plans = plansResponseSchema.parse(body).plans;
    expect(plans.map((p) => [p.key, p.priceMonthly])).toEqual([
      ['free', 0],
      ['pro', 9],
      ['team', 29],
      ['enterprise', null],
    ]);
    expect(PLANS[3]!.displayAmount).toEqual({ month: null, year: null });
    const u = await f.user();
    const checkout = (planKey: string) =>
      f.call('POST', '/api/billing/me/checkout', { planKey, interval: 'month' }, u.auth);
    expect((await checkout('pro')).json).toEqual({ url: '/checkout', id: 'cs_test_pro' });
    expect((await checkout('free')).status).toBe(400);
    expect((await checkout('enterprise')).json).toEqual({
      message: 'This plan is not purchasable yet',
    });
    const off = await makeFake({ stripeMode: 'off' });
    const v = await off.user();
    expect(
      (await off.call('POST', '/api/billing/me/checkout', { planKey: 'pro' }, v.auth)).json,
    ).toEqual({ code: 'BILLING_DISABLED' });
  });

  it('describeApi groups routes by resource, skipping GET /api', () => {
    const d = describeApi([
      { method: 'GET', path: '/api' },
      { method: 'GET', path: '/api/boards' },
      { method: 'POST', path: '/api/boards' },
    ]);
    expect(d).toEqual({
      message: 'Orqea API',
      endpoints: {
        boards: {
          get0: { method: 'GET', path: '/api/boards' },
          post1: { method: 'POST', path: '/api/boards' },
        },
      },
    });
    expect(flattenEndpoints(d.endpoints)).toHaveLength(2);
  });
});
