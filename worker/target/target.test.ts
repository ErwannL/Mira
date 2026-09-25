import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { catalogue } from '../../shared/test-helpers/fixtures.js';
import { liveFake } from '../test-helpers/live-fake.js';
import { SECRET } from '../../fake-orqea/test-helpers/fake.js';
import { ContractError, OrqeaClient, type Endpoint, type TargetInfo } from './client.js';
import { checkDrift, normalisePath } from './drift.js';
import { guardTarget, REFUSAL_MESSAGES, REQUIRED_ENDPOINTS, type GuardInput } from './guard.js';

let fake: Awaited<ReturnType<typeof liveFake>>;
beforeAll(async () => {
  fake = await liveFake();
});
afterAll(async () => fake.close());
const client = (o: Partial<ConstructorParameters<typeof OrqeaClient>[0]> = {}) =>
  new OrqeaClient({ baseUrl: fake.baseUrl, serviceSecret: SECRET, runId: 'r1', fetchImpl: fetch, nowS: () => Math.floor(Date.now() / 1000), ...o });

describe('OrqeaClient against the fake', () => {
  it('implements every contract call', async () => {
    const c = client();
    expect(await c.targetInfo()).toEqual({ env: 'development', stripeMode: 'test', syntheticEnabled: true, version: 'fake-test' });
    expect((await c.endpoints()).length).toBeGreaterThan(20);
    expect((await c.plans()).map((p) => p.key)).toEqual(['free', 'pro', 'team']);
    await fake.call('POST', '/api/auth/register', { email: 'synth+r1-student@synthetic.invalid', password: 'Str0ngPassword', acceptedTerms: true });
    expect(await c.requestVerifyUrl('synth+r1-student@synthetic.invalid')).toContain('/api/auth/verify-email?token=');
    await c.setScenario({ preset: 'unclear-signup' });
    expect(fake.deps.scenarios.get('r1').extraSignupFields).toBe(4);
    expect(await c.cleanup()).toMatchObject({ residualRows: 0 });
    expect(c.runHeader()).toMatch(/^r1\.\d+\.[0-9a-f]{64}$/);
  });
  it('turns failures into ContractErrors naming the endpoint', async () => {
    await expect(client({ serviceSecret: 'x'.repeat(32) }).targetInfo()).rejects.toThrow('GET /api/admin/synthetic/target → 401');
    await expect(client().requestVerifyUrl('nobody@example.com')).rejects.toBeInstanceOf(ContractError);
    await expect(client({ baseUrl: 'http://127.0.0.1:1' }).plans()).rejects.toThrow('GET /api/billing/plans → 0');
    const weird = client({ fetchImpl: (async () => new Response('[]', { status: 200 })) as typeof fetch });
    await expect(weird.endpoints()).rejects.toThrow('unexpected payload');
    const html = client({ fetchImpl: (async () => new Response('<html>', { status: 200 })) as typeof fetch });
    await expect(html.targetInfo()).rejects.toThrow('unexpected payload');
  });
});

const info: TargetInfo = { env: 'staging', stripeMode: 'test', syntheticEnabled: true, version: '1' };
const allEndpoints: Endpoint[] = REQUIRED_ENDPOINTS.map((r) => ({ method: r.split(' ')[0]!, path: r.split(' ')[1]! }));
const stub = (i: Partial<TargetInfo> = {}, eps = allEndpoints) => ({ targetInfo: async () => ({ ...info, ...i }), endpoints: async () => eps });
const input = (o: Partial<GuardInput> = {}): GuardInput => ({
  targetUrl: 'http://localhost:4100',
  allowRemote: false,
  confirmHost: null,
  localHosts: ['fake-orqea'],
  productionHosts: ['app.orqea.com'],
  requested: { accounts: 10, requestsPerSecond: 5, rows: 100 },
  caps: { accounts: 100, requestsPerSecond: 10, rows: 1000 },
  ...o,
});

describe('guardTarget', () => {
  it('accepts a local, synthetic, complete, capped target', async () => {
    expect(await guardTarget(input(), stub())).toMatchObject({ ok: true, info });
    expect((await guardTarget(input({ targetUrl: 'http://fake-orqea:4100' }), stub())).ok).toBe(true);
    expect((await guardTarget(input({ targetUrl: 'http://[::1]:4100' }), stub())).ok).toBe(true);
  });
  it('REMOTE_HOST_UNCONFIRMED unless allowed and the host is retyped exactly', async () => {
    const remote = { targetUrl: 'https://staging.orqea.dev' };
    expect(await guardTarget(input(remote), stub())).toEqual({ ok: false, code: 'REMOTE_HOST_UNCONFIRMED', message: REFUSAL_MESSAGES.REMOTE_HOST_UNCONFIRMED });
    expect((await guardTarget(input({ ...remote, allowRemote: true }), stub())).ok).toBe(false);
    expect((await guardTarget(input({ ...remote, allowRemote: true, confirmHost: 'staging.orqea.de' }), stub())).ok).toBe(false);
    expect((await guardTarget(input({ ...remote, confirmHost: 'staging.orqea.dev' }), stub())).ok).toBe(false);
    expect((await guardTarget(input({ ...remote, allowRemote: true, confirmHost: ' Staging.Orqea.dev ' }), stub())).ok).toBe(true);
  });
  it('SYNTHETIC_DISABLED, VOLUME_CAP, contract gaps', async () => {
    expect(await guardTarget(input(), stub({ syntheticEnabled: false }))).toMatchObject({ code: 'SYNTHETIC_DISABLED' });
    for (const k of ['accounts', 'requestsPerSecond', 'rows'] as const) {
      const requested = { accounts: 1, requestsPerSecond: 1, rows: 1, [k]: 1e9 };
      expect(await guardTarget(input({ requested }), stub())).toMatchObject({ code: 'VOLUME_CAP' });
    }
    const r = await guardTarget(input(), stub({}, allEndpoints.filter((e) => e.path !== '/api/auth/login')));
    expect(r).toEqual({ ok: false, code: 'ORQEA_CONTRACT_MISSING:POST /api/auth/login', message: REFUSAL_MESSAGES.ORQEA_CONTRACT_MISSING });
    const noTarget = { targetInfo: async () => { throw new ContractError('GET /api/admin/synthetic/target', 404, 'x'); }, endpoints: async () => [] };
    expect(await guardTarget(input(), noTarget)).toMatchObject({ code: 'ORQEA_CONTRACT_MISSING:GET /api/admin/synthetic/target' });
    const boom = { targetInfo: async () => { throw new Error('bug'); }, endpoints: async () => [] };
    await expect(guardTarget(input(), boom)).rejects.toThrow('bug');
  });
  it('PRODUCTION_ENV: by host list, by reported env, and for unknown envs', async () => {
    expect(await guardTarget(input({ targetUrl: 'https://APP.orqea.com', allowRemote: true, confirmHost: 'app.orqea.com' }), stub())).toMatchObject({ code: 'PRODUCTION_ENV' });
    for (const env of ['production', 'prod', 'live', 'PRODUCTION', '', 'unknown']) {
      expect(await guardTarget(input(), stub({ env })), env).toMatchObject({ code: 'PRODUCTION_ENV' });
    }
  });
  it('PRODUCTION_ENV has no bypass whatever the other inputs (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), fc.option(fc.string()), fc.array(fc.string()), fc.constantFrom('production', 'prod', 'Production', 'live'), fc.boolean(),
        async (allowRemote, confirmHost, localHosts, env, localTarget) => {
          const targetUrl = localTarget ? 'http://localhost:4100' : 'https://orqea.example';
          const r = await guardTarget(
            input({ targetUrl, allowRemote, confirmHost: confirmHost ?? 'orqea.example', localHosts, caps: { accounts: 1e9, requestsPerSecond: 1e9, rows: 1e9 } }),
            stub({ env }),
          );
          expect(r.ok).toBe(false);
          if (!r.ok && r.code !== 'REMOTE_HOST_UNCONFIRMED') expect(r.code).toBe('PRODUCTION_ENV');
        },
      ),
    );
  });
  it('the real fake passes the guard', async () => {
    expect((await guardTarget(input({ targetUrl: fake.baseUrl }), client())).ok).toBe(true);
  });
});

describe('drift', () => {
  it('normalises template and route params, query strings and trailing slashes', () => {
    expect(normalisePath('/api/boards/{{boardId}}/lists?x=1')).toBe('/api/boards/:*/lists');
    expect(normalisePath('/api/boards/:boardId/lists/')).toBe('/api/boards/:*/lists');
    expect(normalisePath('/')).toBe('/');
  });
  it('the catalogue has no drift against the fake Orqea', async () => {
    const report = checkDrift(catalogue, await client().endpoints());
    expect(report.missing).toEqual([]);
    expect(report.uncatalogued).toEqual(['GET /api/boards', 'GET /api/me']);
  });
  it('reports every catalogue step the target lacks', () => {
    const r = checkDrift(catalogue, [{ method: 'get', path: '/api/billing/plans' }]);
    expect(r.missing.some((m) => m.useCase === 'signup' && m.path === '/api/auth/register')).toBe(true);
    expect(r.missing.some((m) => m.useCase === 'landing')).toBe(false);
  });
});
