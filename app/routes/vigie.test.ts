import { afterEach, describe, expect, it } from 'vitest';
import { PERSONA_SET, SCENARIO } from '../../shared/test-helpers/vigie.js';
import { getRun, transition } from '../db/runs.js';
import { saveVigieSet, vigiePersonas, allPersonas } from '../db/vigie.js';
import { data, makeApp } from '../test-helpers/app.js';
import { vigieState } from './vigie.js';

const SECRET = 'vigie-secret-'.padEnd(40, 'v');
const TARGETS = {
  local: { api: 'http://backend:5001', web: 'http://frontend:3001', rewrite: {} },
  recette: { api: 'http://host.docker.internal:5102', rewrite: {} },
  staging: { api: 'http://s:1', web: 'http://s:2', rewrite: {} },
};
const bearer = { authorization: `Bearer ${SECRET}` };

let h: Awaited<ReturnType<typeof makeApp>> | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});
const vigie = async (o = {}) =>
  (h = await makeApp({ vigieSecret: SECRET, targets: TARGETS, ...o }));
const call = (
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = bearer,
) => h!.req(method, url, { body, headers });

describe('Vigie service API: authentication and reachability', () => {
  it('every route answers 401 without the right Bearer, or when no secret is configured', async () => {
    await vigie();
    for (const [m, url] of [
      ['POST', '/api/vigie/replays'],
      ['GET', '/api/vigie/replays/x'],
      ['POST', '/api/vigie/personas'],
    ] as const) {
      expect((await call(m, url, {}, {})).status, url).toBe(401);
      expect((await call(m, url, {}, { authorization: `Bearer ${'x'.repeat(40)}` })).status).toBe(
        401,
      );
    }
    await h!.close();
    h = await makeApp({ vigieSecret: null, targets: TARGETS });
    expect((await call('GET', '/api/vigie/replays/x')).json).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('from the docker network: reachable with the Bearer only; everything else stays 404', async () => {
    await vigie();
    const fromNetwork = (url: string, headers: Record<string, string>) =>
      h!.req('GET', url, { headers: { host: 'figura-app:4000', ...headers } });
    expect((await fromNetwork('/api/vigie/replays/nope', bearer)).status).toBe(404);
    expect((await fromNetwork('/api/vigie/replays/nope', bearer)).json).toEqual({
      error: 'NOT_FOUND',
    });
    expect((await fromNetwork('/api/vigie/replays/nope', {})).status).toBe(404);
    expect((await fromNetwork('/health', bearer)).status).toBe(404);
    expect((await fromNetwork('/api/runs', bearer)).status).toBe(404);
    // A session route never accepts the Vigie Bearer.
    expect((await call('GET', '/api/runs')).status).toBe(401);
  });
});

describe('POST /api/vigie/replays', () => {
  it("queues a one-persona replay run on the named target (Vigie's `dev` = `local`)", async () => {
    await vigie();
    const r = await call('POST', '/api/vigie/replays', { ...SCENARIO, targetEnv: 'dev' });
    expect(r.status).toBe(202);
    const run = (await getRun(h!.db, r.json.runId as string))!;
    expect(run).toMatchObject({ kind: 'replay', status: 'queued', created_by: 'vigie' });
    expect(run.config).toMatchObject({
      target: 'local',
      targetUrl: 'http://backend:5001',
      webUrl: 'http://frontend:3001',
      label: 'Vigie 1 (prod → dev)',
      replay: { incidentId: 1, targetEnv: 'dev' },
    });
    const noIncident = await call('POST', '/api/vigie/replays', {
      ...SCENARIO,
      targetEnv: 'staging',
      incidentId: undefined,
    });
    expect((await getRun(h!.db, noIncident.json.runId as string))!.config.label).toBe(
      'Vigie scenario (prod → staging)',
    );
  });

  it('refuses bad scenarios (400), production and unconfigured or web-less targets (409)', async () => {
    await vigie();
    expect((await call('POST', '/api/vigie/replays', { schema: 2 })).json).toMatchObject({
      error: 'INVALID_SCENARIO',
    });
    const refused = async (targetEnv: string) =>
      (await call('POST', '/api/vigie/replays', { ...SCENARIO, targetEnv })).json;
    expect(await refused('prod')).toMatchObject({ error: 'PRODUCTION_ENV' });
    expect(await refused('production')).toMatchObject({ error: 'PRODUCTION_ENV' });
    expect(await refused('qa')).toMatchObject({ error: 'TARGET_NOT_CONFIGURED' });
    // recette has no web URL here: a replay drives the web app.
    const noWeb = await call('POST', '/api/vigie/replays', SCENARIO);
    expect([noWeb.status, noWeb.json.error]).toEqual([409, 'TARGET_NOT_CONFIGURED']);
  });
});

describe('GET /api/vigie/replays/:runId', () => {
  it('maps the run lifecycle to Vigie states, with per-step evidence', async () => {
    await vigie();
    const id = (await call('POST', '/api/vigie/replays', { ...SCENARIO, targetEnv: 'dev' })).json
      .runId as string;
    const state = async () => (await call('GET', `/api/vigie/replays/${id}`)).json;
    expect(await state()).toEqual({ state: 'queued', evidence: { steps: [] } });
    await transition(h!.db, id, 'preparing', 'w');
    await transition(h!.db, id, 'running', 'w');
    expect((await state()).state).toBe('running');
    await transition(h!.db, id, 'cleaning', 'w');
    const steps = [
      {
        index: 0,
        action: 'visit',
        durationMs: 900,
        status: 200,
        ok: true,
        breached: true,
        error: null,
      },
    ];
    await transition(h!.db, id, 'done', 'w', null, {
      summary: { replay: { reproduced: true, incomplete: null, steps } },
    });
    expect(await state()).toEqual({ state: 'reproduced', evidence: { steps } });
    expect((await call('GET', '/api/vigie/replays/nope')).status).toBe(404);
  });

  it('refused and failed runs are `failed` with their reason; journey runs are not replays', async () => {
    await vigie();
    const id = (await call('POST', '/api/vigie/replays', { ...SCENARIO, targetEnv: 'dev' })).json
      .runId as string;
    await transition(h!.db, id, 'preparing', 'w');
    await transition(h!.db, id, 'refused', 'w', 'x', { refusal_code: 'PRODUCTION_ENV' });
    expect((await call('GET', `/api/vigie/replays/${id}`)).json).toEqual({
      state: 'failed',
      evidence: { steps: [] },
      error: 'PRODUCTION_ENV',
    });
    const id2 = (await call('POST', '/api/vigie/replays', { ...SCENARIO, targetEnv: 'dev' })).json
      .runId as string;
    await transition(h!.db, id2, 'preparing', 'w');
    await transition(h!.db, id2, 'failed', 'w', 'x', { error: 'REPLAY_INCOMPLETE: step 0: x' });
    expect((await call('GET', `/api/vigie/replays/${id2}`)).json.error).toBe(
      'REPLAY_INCOMPLETE: step 0: x',
    );
    // Vigie keys off these prefixes of the top-level `error`.
    for (const error of [
      'TARGET_UNREACHABLE: step 0: vigie-visit: step 1: page.goto: Timeout 8000ms exceeded',
      'TARGET_NOT_READY: http://frontend:3001 did not answer within 120000 ms',
    ]) {
      const idN = (await call('POST', '/api/vigie/replays', { ...SCENARIO, targetEnv: 'dev' })).json
        .runId as string;
      await transition(h!.db, idN, 'preparing', 'w');
      await transition(h!.db, idN, 'failed', 'w', 'x', { error });
      const got = (await call('GET', `/api/vigie/replays/${idN}`)).json;
      expect(got.state).toBe('failed');
      expect(got.error).toBe(error);
      expect(String(got.error)).toMatch(/^(TARGET_UNREACHABLE|TARGET_NOT_READY)/);
    }
    const c = await h!.login();
    const journey = await h!.api('POST', '/api/runs', c, {
      config: { kind: 'journey', targetUrl: 'http://localhost:4100' },
    });
    const jid = (journey.json.run as { id: string }).id;
    expect((await call('GET', `/api/vigie/replays/${jid}`)).status).toBe(404);
  });

  it('vigieState covers every run status', () => {
    const row = (status: string, summary: object | null = null) =>
      ({ status, summary }) as Parameters<typeof vigieState>[0];
    expect(['draft', 'queued', 'preparing'].map((s) => vigieState(row(s)))).toEqual([
      'queued',
      'queued',
      'queued',
    ]);
    expect(['running', 'reporting', 'cleaning'].map((s) => vigieState(row(s)))).toEqual([
      'running',
      'running',
      'running',
    ]);
    expect(['failed', 'refused', 'cancelled'].map((s) => vigieState(row(s)))).toEqual([
      'failed',
      'failed',
      'failed',
    ]);
    expect(vigieState(row('done'))).toBe('not_reproduced');
    expect(vigieState(row('done', { replay: { reproduced: false } }))).toBe('not_reproduced');
  });
});

describe('POST /api/vigie/personas', () => {
  it('stores the set once (idempotent), usable by later runs, never over a catalogue persona', async () => {
    await vigie();
    const r = await call('POST', '/api/vigie/personas', PERSONA_SET);
    expect(r.status).toBe(202);
    expect(r.json).toEqual({ accepted: 2, setId: expect.stringMatching(/^[0-9a-f]{32}$/) });
    expect((await call('POST', '/api/vigie/personas', PERSONA_SET)).json).toEqual(r.json);
    expect((await vigiePersonas(h!.db)).map((p) => p.id)).toEqual([
      'vigie-free-desktop',
      'vigie-pro-mobile',
    ]);
    const c = await h!.login();
    const meta = await h!.api('GET', '/api/meta', c);
    expect((meta.json.personas as { id: string }[]).map((p) => p.id)).toContain('vigie-pro-mobile');
    const run = await h!.api('POST', '/api/runs', c, {
      config: {
        kind: 'journey',
        targetUrl: 'http://localhost:4100',
        personaIds: ['vigie-pro-mobile'],
      },
    });
    expect(run.status).toBe(201);
    // A newer set with the same names replaces those personas.
    const newer = { ...PERSONA_SET, window: { from: 'a', to: 'b', days: 7 } };
    expect((await call('POST', '/api/vigie/personas', newer)).json.accepted).toBe(2);
    expect((await vigiePersonas(h!.db)).length).toBe(2);
  });

  it('refuses invalid sets (400), duplicate names, production and unknown targets (409)', async () => {
    await vigie();
    expect((await call('POST', '/api/vigie/personas', { schema: 1 })).json).toMatchObject({
      error: 'INVALID_PERSONA_SET',
    });
    const twice = { ...PERSONA_SET, personas: [PERSONA_SET.personas[1], PERSONA_SET.personas[1]] };
    expect((await call('POST', '/api/vigie/personas', twice)).json).toEqual({
      error: 'INVALID_PERSONA_SET',
      issues: ['personas: duplicate names'],
    });
    for (const [targetEnv, error] of [
      ['prod', 'PRODUCTION_ENV'],
      ['qa', 'TARGET_NOT_CONFIGURED'],
    ])
      expect(
        (await call('POST', '/api/vigie/personas', { ...PERSONA_SET, targetEnv })).json,
      ).toMatchObject({
        error,
      });
  });
});

describe('stored Vigie personas (db)', () => {
  it('rolls back a failed set, skips rows that no longer fit, never shadows the catalogue', async () => {
    await vigie();
    const student = data.personas.find((p) => p.id === 'student')!;
    await expect(
      saveVigieSet(h!.db, {
        setId: 's1',
        sourceEnv: null as unknown as string,
        targetEnv: 'dev',
        personas: [student],
      }),
    ).rejects.toThrow();
    expect(await vigiePersonas(h!.db)).toEqual([]);
    await saveVigieSet(h!.db, {
      setId: 's2',
      sourceEnv: 'prod',
      targetEnv: 'dev',
      personas: [student],
    });
    await h!.db.query(
      "insert into vigie_personas (id, set_id, persona) values ('vigie-broken', 's2', '{\"id\":1}')",
    );
    expect((await vigiePersonas(h!.db)).map((p) => p.id)).toEqual(['student']);
    const all = await allPersonas(h!.db, data.personas);
    expect(all.filter((p) => p.id === 'student')).toEqual([student]);
    expect(all).toHaveLength(data.personas.length);
  });
});
