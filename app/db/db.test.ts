import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dataKey } from '../../shared/crypto.js';
import { runConfigSchema } from '../../shared/run-config.js';
import { MIGRATIONS, testDb } from '../test-helpers/db.js';
import { eventsOf, EventWriter } from './events.js';
import { DbMemoryStore, memoriesOf } from './memory.js';
import {
  audit,
  auditTrail,
  consumeSsoToken,
  createSession,
  deleteSession,
  findSession,
  getReport,
  saveCalibration,
  saveReport,
} from './misc.js';
import { migrate, type Db } from './pool.js';
import {
  claimNext,
  createRun,
  deleteRun,
  getRun,
  heartbeat,
  isCancelRequested,
  listRuns,
  requestCancel,
  staleRuns,
  transition,
  transitionsOf,
  TransitionError,
} from './runs.js';
import { newMemory } from '../../worker/engine/journey.js';
import { persona } from '../../shared/test-helpers/fixtures.js';
import type { JourneyEvent } from '../../worker/engine/types.js';

let db: Db;
beforeEach(async () => {
  db?.end();
  db = await testDb();
});
afterAll(async () => db.end());
const config = runConfigSchema.parse({ kind: 'journey', targetUrl: 'http://localhost:4100' });

describe('migrations', () => {
  it('are idempotent and roll back a broken file', async () => {
    expect(await migrate(db, MIGRATIONS)).toEqual([]);
    const dir = mkdtempSync(join(tmpdir(), 'mig-'));
    writeFileSync(join(dir, '001_init.sql'), 'select 1');
    writeFileSync(join(dir, '999_bad.sql'), 'create table x (; nonsense');
    writeFileSync(join(dir, 'notes.txt'), 'ignored');
    await expect(migrate(db, dir)).rejects.toThrow();
    const { rows } = await db.query(
      "select count(*)::int as n from schema_migrations where name = '999_bad.sql'",
    );
    expect(rows[0].n).toBe(0);
  });
});

describe('runs', () => {
  it('create → queue → claim (skip locked) → transitions, all audited', async () => {
    await createRun(db, 'r1', config, 42, 'ops');
    expect((await getRun(db, 'r1'))!.seed).toBe(42);
    expect(await claimNext(db, 'w1')).toBeNull();
    await transition(db, 'r1', 'queued', 'ops');
    const [a, b] = await Promise.all([claimNext(db, 'w1'), claimNext(db, 'w2')]);
    expect([a?.id, b?.id].filter(Boolean)).toEqual(['r1']);
    const running = await transition(db, 'r1', 'running', 'w1', null, {
      catalogue_version: 'c1',
      weights_version: 'w1',
      target_version: 't1',
    });
    expect(running).toMatchObject({ status: 'running', catalogue_version: 'c1' });
    await expect(transition(db, 'r1', 'queued', 'x')).rejects.toBeInstanceOf(TransitionError);
    await expect(transition(db, 'nope', 'queued', 'x')).rejects.toThrow('cannot go from missing');
    await transition(db, 'r1', 'reporting', 'w1');
    await transition(db, 'r1', 'cleaning', 'w1');
    const done = await transition(db, 'r1', 'done', 'w1', 'ok', { summary: { a: 1 } });
    expect(done.finished_at).not.toBeNull();
    expect((await transitionsOf(db, 'r1')).map((t) => `${t.from_status}>${t.to_status}`)).toEqual([
      'null>draft',
      'draft>queued',
      'queued>preparing',
      'preparing>running',
      'running>reporting',
      'reporting>cleaning',
      'cleaning>done',
    ]);
    expect((await listRuns(db)).map((r) => r.id)).toEqual(['r1']);
  });

  it('cancel: immediate before start, flagged while running, no-op when final or missing', async () => {
    await createRun(db, 'c1', config, 1, 'ops');
    expect((await requestCancel(db, 'c1', 'ops'))!.status).toBe('cancelled');
    expect((await requestCancel(db, 'c1', 'ops'))!.status).toBe('cancelled');
    expect(await requestCancel(db, 'ghost', 'ops')).toBeNull();
    await createRun(db, 'c2', config, 1, 'ops');
    await transition(db, 'c2', 'queued', 'ops');
    await claimNext(db, 'w');
    expect(await isCancelRequested(db, 'c2')).toBe(false);
    expect((await requestCancel(db, 'c2', 'ops'))!.status).toBe('preparing');
    expect(await isCancelRequested(db, 'c2')).toBe(true);
    expect(await isCancelRequested(db, 'ghost')).toBe(false);
  });

  it('finds stale runs and deletes only final ones', async () => {
    await createRun(db, 's1', config, 1, 'ops');
    await transition(db, 's1', 'queued', 'ops');
    await claimNext(db, 'w');
    expect(await staleRuns(db, 60)).toHaveLength(0);
    await db.query("update runs set heartbeat_at = now() - interval '2 hours'");
    expect((await staleRuns(db, 60)).map((r) => r.id)).toEqual(['s1']);
    await heartbeat(db, 's1');
    expect(await staleRuns(db, 60)).toHaveLength(0);
    expect(await deleteRun(db, 's1')).toBe(false);
    await transition(db, 's1', 'failed', 'w');
    expect(await deleteRun(db, 's1')).toBe(true);
    expect(await getRun(db, 's1')).toBeNull();
  });
});

const ev = (i: number, personaId = 'student'): JourneyEvent => ({
  kind: 'step',
  personaId,
  session: 1,
  simTime: '2030-01-07T09:00:00Z',
  wallTime: '2030-01-01T00:00:00Z',
  useCaseId: 'signup',
  attempt: 1,
  ok: true,
  wallMs: i,
  facts: null,
  friction: null,
  frustration: 0,
  action: 'continue',
  rule: `r${i}`,
  mistakes: [],
  screenshot: null,
  apiCalls: [],
  money: null,
  error: null,
});

describe('events, memory, reports, sessions, audit', () => {
  it('writes events in batches and reads them back in order, per persona', async () => {
    await createRun(db, 'e1', config, 1, 'ops');
    const w = new EventWriter(db, 'e1', 2);
    await w.flush();
    for (let i = 0; i < 5; i++) await w.event(ev(i, i % 2 ? 'teacher' : 'student'));
    await w.flush();
    const all = await eventsOf(db, 'e1');
    expect(all.map((e) => e.rule)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4']);
    expect(all.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
    expect((await eventsOf(db, 'e1', 'teacher')).map((e) => e.rule)).toEqual(['r1', 'r3']);
  });

  it('stores memory with credentials encrypted at rest', async () => {
    await createRun(db, 'm1', config, 1, 'ops');
    const key = dataKey('k'.repeat(32));
    const store = new DbMemoryStore(db, 'm1', key);
    expect(await store.load('student')).toBeNull();
    const memory = newMemory(persona('student'), {
      boardName: 'B',
      token: 't',
      verifyUrl: 'u',
      verifyToken: 'v',
    });
    await store.save(memory, {
      email: 'synth+m1-student@synthetic.invalid',
      password: 'Sup3rSecret!',
    });
    const { rows } = await db.query('select credentials_enc from persona_memory');
    expect(rows[0].credentials_enc).not.toContain('Sup3rSecret');
    expect((await store.load('student'))!.credentials!.password).toBe('Sup3rSecret!');
    expect((await store.load('student'))!.memory.vars).toEqual({ boardName: 'B' });
    memory.stage = 'done';
    await store.save(memory, null);
    expect(await store.load('student')).toEqual({
      memory: { ...memory, vars: { boardName: 'B' } },
      credentials: null,
    });
    expect((await memoriesOf(db, 'm1')).map((m) => m.stage)).toEqual(['done']);
  });

  it('reports, calibration, audit, SSO single use and sessions', async () => {
    await createRun(db, 'x1', config, 1, 'ops');
    expect(await getReport(db, 'x1', 'funnel')).toBeNull();
    await saveReport(db, 'x1', 'funnel', { v: 1 });
    await saveReport(db, 'x1', 'funnel', { v: 2 });
    expect(await getReport(db, 'x1', 'funnel')).toEqual({ v: 2 });
    await saveCalibration(db, 'x1', 'ops', { funnel: {} });
    await audit(db, 'ops', 'run.create', { id: 'x1' });
    await audit(db, 'ops', 'noop');
    expect((await auditTrail(db)).map((a) => a.action)).toEqual(['noop', 'run.create']);
    const soon = new Date(Date.now() + 60_000);
    expect(await consumeSsoToken(db, 'h1', soon)).toBe(true);
    expect(await consumeSsoToken(db, 'h1', soon)).toBe(false);
    await createSession(db, 's1', 'Ops', soon);
    expect(await findSession(db, 's1')).toEqual({ operator: 'Ops', target: null });
    await createSession(db, 's3', 'Ops', soon, 'local');
    expect(await findSession(db, 's3')).toEqual({ operator: 'Ops', target: 'local' });
    await createSession(db, 's2', 'Old', new Date(Date.now() - 1000));
    expect(await findSession(db, 's2')).toBeNull();
    await deleteSession(db, 's1');
    expect(await findSession(db, 's1')).toBeNull();
  });
});
