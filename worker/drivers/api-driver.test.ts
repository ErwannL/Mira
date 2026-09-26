import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalogue, persona } from '../../shared/test-helpers/fixtures.js';
import { liveFake } from '../test-helpers/live-fake.js';
import { ApiDriver, isUnclear } from './api-driver.js';
import { RateLimiter } from './limiter.js';
import type { AttemptContext } from '../engine/types.js';

const uc = (id: string) => catalogue.useCases.find((u) => u.id === id)!;
const p = persona('student');
let fake: Awaited<ReturnType<typeof liveFake>>;
beforeAll(async () => {
  fake = await liveFake();
});
afterAll(async () => fake.close());

function driver(overrides: Partial<ConstructorParameters<typeof ApiDriver>[0]> = {}) {
  return new ApiDriver({
    baseUrl: fake.baseUrl,
    runHeader: () => fake.runHeader(),
    fetchImpl: fetch,
    now: Date.now,
    limiter: null,
    ...overrides,
  });
}
const ctx = (
  vars: Record<string, string>,
  mistakes: AttemptContext['mistakes'] = [],
): AttemptContext => ({ persona: p, vars, mistakes, label: 't' });

describe('ApiDriver', () => {
  it('lives signup → verify → login → board → card through the API', async () => {
    const d = driver();
    const vars: Record<string, string> = {
      email: 'synth+r1-student@synthetic.invalid',
      username: 'sr1_student',
      password: 'Str0ngPassword1!',
      boardName: 'Uni',
      cardTitle: 'Essay',
    };
    const signup = await d.attempt(uc('signup'), ctx(vars));
    expect(signup.ok).toBe(true);
    expect(signup.apiCalls[0]).toMatchObject({
      method: 'POST',
      path: '/api/auth/register',
      status: 201,
    });
    const login403 = await d.attempt(uc('login'), ctx(vars));
    expect(login403.ok).toBe(false);
    expect(login403.error).toBe('POST /api/auth/login → 403 Email not verified');
    expect(login403.facts.validationErrors).toBe(1);
    vars.verifyToken = fake.deps.store.userByEmail(vars.email!)!.verifyToken;
    expect((await d.attempt(uc('verify-email'), ctx(vars))).ok).toBe(true);
    const login = await d.attempt(uc('login'), ctx(vars));
    expect(login.ok).toBe(true);
    Object.assign(vars, login.captured);
    const board = await d.attempt(uc('create-board'), ctx(vars));
    Object.assign(vars, board.captured);
    const card = await d.attempt(uc('create-card'), ctx(vars));
    expect(card.ok).toBe(true);
    expect(card.captured.cardId).toBeDefined();
    expect(card.facts.clicksToGoal).toBe(2);
    Object.assign(vars, card.captured);
    const search = await d.attempt(uc('global-search'), ctx({ ...vars, cardTitle: 'Es say' }));
    expect(search.ok).toBe(true);
    const rule = await d.attempt(uc('automation-rule'), ctx(vars));
    expect(rule.ok).toBe(true);
    const lists = await d.attempt(uc('create-list'), ctx(vars));
    expect(lists.captured.backlogListId).toBeDefined();
    const paywalled = await d.attempt(uc('qr-create'), ctx(vars));
    expect(paywalled).toMatchObject({
      ok: false,
      paywall: { code: 'FEATURE_LOCKED', featureKey: 'qrCodes' },
    });
    expect(paywalled.facts.paywall).toBe(true);
    await d.close();
  });

  it('turns mistakes into validation errors, clear thanks to Orqea issues', async () => {
    const d = driver();
    const vars = {
      email: 'synth+r1-sam@synthetic.invalid',
      username: 'sr1_sam',
      password: 'Str0ngPassword1!',
    };
    for (const m of ['typoEmail', 'weakPassword'] as const) {
      const r = await d.attempt(uc('signup'), ctx(vars, [m]));
      expect(r.ok, m).toBe(false);
      expect(r.facts).toMatchObject({ validationErrors: 1, unclearErrors: 0 });
    }
    // Orqea's API does not check acceptedTerms (only its web form does): a known fact.
    expect((await d.attempt(uc('signup'), ctx(vars, ['forgetTerms']))).ok).toBe(true);
  });

  it('counts unclear messages, captcha that would show, and plan limits without a feature', async () => {
    const f2 = await liveFake({}, { unclearErrors: true, captcha: true, boardLimit: 1 });
    const d = new ApiDriver({
      baseUrl: f2.baseUrl,
      runHeader: () => f2.runHeader(),
      fetchImpl: fetch,
      now: Date.now,
      limiter: null,
    });
    const vars: Record<string, string> = {
      email: 'synth+r1-x@synthetic.invalid',
      username: 'sr1_x',
      password: 'Str0ngPassword1!',
      boardName: 'A',
    };
    const bad = await d.attempt(uc('signup'), ctx(vars, ['typoEmail']));
    expect(bad.facts.unclearErrors).toBe(1);
    const good = await d.attempt(uc('signup'), ctx(vars));
    expect(good.facts.captcha).toBe(true);
    f2.deps.store.userByEmail(vars.email!)!.verified = true;
    Object.assign(vars, (await d.attempt(uc('login'), ctx(vars))).captured);
    await d.attempt(uc('create-board'), ctx(vars));
    const limit = await d.attempt(uc('create-board'), ctx(vars));
    expect(limit.paywall).toEqual({ code: 'PLAN_LIMIT', featureKey: 'maxBoards' });
    await f2.close();
  });

  it('network failures, 5xx, non-JSON bodies and odd 402s', async () => {
    const vars = { email: 'a@b.c', password: 'x' };
    const down = driver({
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as typeof fetch,
    });
    const r = await down.attempt(uc('signup'), ctx(vars));
    expect(r.facts.networkErrors).toBe(1);
    expect(r.error).toBe('POST /api/auth/register → 0');
    const respond = (status: number, body: string) =>
      (async () => new Response(body, { status })) as typeof fetch;
    const five = await driver({ fetchImpl: respond(503, 'oops') }).attempt(uc('signup'), ctx(vars));
    expect(five.facts.networkErrors).toBe(1);
    const odd = await driver({ fetchImpl: respond(402, '{}') }).attempt(uc('signup'), ctx(vars));
    expect(odd.paywall).toEqual({ code: 'PAYWALL', featureKey: 'unknown' });
    const plain = await driver({ fetchImpl: respond(200, '{"id":1}') }).attempt(
      uc('landing'),
      ctx(vars),
    );
    expect(plain.ok).toBe(true);
    const noMessage = await driver({ fetchImpl: respond(400, '{}') }).attempt(
      uc('signup'),
      ctx(vars),
    );
    expect(noMessage.facts.unclearErrors).toBe(1);
    expect(noMessage.error).toBe('POST /api/auth/register → 400');
    const coded = await driver({
      fetchImpl: respond(400, '{"code":"NO_ACTIONS","field":"actions"}'),
    }).attempt(uc('signup'), ctx(vars));
    expect(coded.error).toBe('POST /api/auth/register → 400 NO_ACTIONS');
    const legacy = await driver({ fetchImpl: respond(409, '{"error":"EMAIL_EXISTS"}') }).attempt(
      uc('signup'),
      ctx(vars),
    );
    expect(legacy.error).toBe('POST /api/auth/register → 409 EMAIL_EXISTS');
    const missing = await driver({ fetchImpl: respond(201, '{}') }).attempt(
      uc('create-board'),
      ctx(vars),
    );
    expect(missing.captured).toEqual({});
  });

  it('respects the rate limiter', async () => {
    let taken = 0;
    const limiter = { take: async () => void taken++ } as unknown as RateLimiter;
    await driver({ limiter }).attempt(uc('landing'), ctx({}));
    expect(taken).toBe(1);
  });

  it('judges message clarity', () => {
    expect(isUnclear('Error.')).toBe(true);
    expect(isUnclear('Something went wrong!!')).toBe(true);
    expect(isUnclear('Enter an email address like name@example.com.')).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('lets a burst through then waits for tokens', async () => {
    let t = 0;
    const sleeps: number[] = [];
    const l = new RateLimiter(
      2,
      () => t,
      async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    );
    await l.take();
    await l.take();
    await l.take();
    expect(sleeps).toEqual([500]);
    expect(() => new RateLimiter(0)).toThrow();
  });
  it('uses the real clock and timer by default', async () => {
    const l = new RateLimiter(50);
    const t0 = Date.now();
    for (let i = 0; i < 52; i++) await l.take();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(15);
  });
});
