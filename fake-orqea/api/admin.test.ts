import { describe, expect, it } from 'vitest';
import { makeFake, NOW } from '../test-helpers/fake.js';

const synth = 'synth+r9-student@synthetic.invalid';

describe('synthetic admin api', () => {
  it('reports the target and requires the service secret', async () => {
    const f = await makeFake();
    expect((await f.call('GET', '/api/admin/synthetic/target', undefined, f.admin)).json).toEqual({
      env: 'development',
      stripeMode: 'test',
      syntheticEnabled: true,
      version: 'fake-test',
    });
    expect((await f.call('GET', '/api/admin/synthetic/target')).status).toBe(401);
    expect(
      (
        await f.call('GET', '/api/admin/synthetic/target', undefined, {
          authorization: 'Bearer nope',
        })
      ).status,
    ).toBe(401);
  });

  it('is invisible (404) in production, when synthetic mode is off, or from non-local sources', async () => {
    for (const cfg of [{ env: 'production' }, { syntheticEnabled: false }]) {
      const f = await makeFake(cfg);
      expect((await f.call('GET', '/api/admin/synthetic/target', undefined, f.admin)).status).toBe(
        404,
      );
    }
    const f = await makeFake();
    const remote = await f.app.inject({
      method: 'GET',
      url: '/api/admin/synthetic/target',
      headers: f.admin,
      remoteAddress: '10.1.2.3',
    });
    expect(remote.statusCode).toBe(404);
    const allowed = await makeFake({ adminAllowed: ['10.1.'] });
    const ok = await allowed.app.inject({
      method: 'GET',
      url: '/api/admin/synthetic/target',
      headers: allowed.admin,
      remoteAddress: '10.1.2.3',
    });
    expect(ok.statusCode).toBe(200);
  });

  it('hands out a verify URL for an unverified account of the run only', async () => {
    const f = await makeFake();
    await f.call('POST', '/api/auth/register', {
      email: synth,
      password: 'Str0ngPassword',
      acceptedTerms: true,
    });
    const r = await f.call(
      'POST',
      '/api/admin/synthetic/verification',
      { email: synth, runId: 'r9' },
      { ...f.admin, host: 'fake:4100' },
    );
    expect(r.json.verifyUrl).toMatch(
      /^http:\/\/fake:4100\/api\/auth\/verify-email\?token=[0-9a-f]+$/,
    );
    const https = await f.call(
      'POST',
      '/api/admin/synthetic/verification',
      { email: synth, runId: 'r9' },
      { ...f.admin, 'x-forwarded-proto': 'https' },
    );
    expect(https.json.verifyUrl).toMatch(/^https:/);
    expect(
      (
        await f.call(
          'POST',
          '/api/admin/synthetic/verification',
          { email: synth, runId: 'other' },
          f.admin,
        )
      ).status,
    ).toBe(404);
    expect((await f.call('POST', '/api/admin/synthetic/verification', {}, f.admin)).status).toBe(
      404,
    );
    await f.call('POST', '/api/auth/register', {
      email: 'real@example.com',
      password: 'Str0ngPassword',
      acceptedTerms: true,
    });
    expect(
      (
        await f.call(
          'POST',
          '/api/admin/synthetic/verification',
          { email: 'real@example.com', runId: 'r9' },
          f.admin,
        )
      ).status,
    ).toBe(404);
    f.deps.store.userByEmail(synth)!.verified = true;
    expect(
      (
        await f.call(
          'POST',
          '/api/admin/synthetic/verification',
          { email: synth, runId: 'r9' },
          f.admin,
        )
      ).status,
    ).toBe(404);
    expect(
      (await f.call('POST', '/api/admin/synthetic/verification', undefined, f.admin)).status,
    ).toBe(404);
  });

  it('cleans up a run or old synthetic accounts, never real ones', async () => {
    const f = await makeFake();
    const s = await f.user(synth);
    await f.call('POST', '/api/boards', { name: 'B' }, s.auth);
    await f.call('POST', '/api/forms', { title: 'F', questions: ['q'] }, s.auth);
    await f.user('real@example.com');
    const r = await f.call('POST', '/api/admin/synthetic/cleanup', { runId: 'r9' }, f.admin);
    expect(r.json).toEqual({ before: 7, after: 1, residualRows: 0 });
    expect(f.deps.store.userByEmail('real@example.com')).toBeDefined();
    const old = await f.user('synth+r8-student@synthetic.invalid');
    old.user.createdAt = NOW - 7200;
    expect(
      (await f.call('POST', '/api/admin/synthetic/cleanup', { olderThanHours: 3 }, f.admin)).json
        .after,
    ).toBe(2);
    expect(
      (await f.call('POST', '/api/admin/synthetic/cleanup', { olderThanHours: 1 }, f.admin)).json
        .after,
    ).toBe(1);
    expect(
      (await f.call('POST', '/api/admin/synthetic/cleanup', { runId: 'BAD!' }, f.admin)).status,
    ).toBe(400);
    expect((await f.call('POST', '/api/admin/synthetic/cleanup', undefined, f.admin)).status).toBe(
      400,
    );
  });

  it('sets a per-run scenario through the control endpoint', async () => {
    const f = await makeFake();
    expect(
      (await f.call('PUT', '/__control/scenario/r1', { preset: 'unclear-signup' }, f.admin)).json,
    ).toEqual({ ok: true });
    expect(f.deps.scenarios.get('r1').extraSignupFields).toBe(4);
    expect(
      (await f.call('PUT', '/__control/scenario/r1', { preset: 'nope' }, f.admin)).status,
    ).toBe(400);
    expect(
      (await f.call('POST', '/api/admin/synthetic/cleanup', { runId: 'r1' }, f.admin)).status,
    ).toBe(200);
    expect(f.deps.scenarios.get('r1').extraSignupFields).toBe(0);
  });

  it('lists its API endpoints for the drift check', async () => {
    const f = await makeFake();
    const eps = (await f.call('GET', '/api')).json.endpoints as { method: string; path: string }[];
    expect(eps).toContainEqual({ method: 'POST', path: '/api/auth/register' });
    expect(eps).toContainEqual({ method: 'PATCH', path: '/api/cards/:cardId' });
    expect(eps.some((e) => e.method === 'HEAD')).toBe(false);
    expect(eps.some((e) => e.path.startsWith('/__control'))).toBe(false);
  });
});
