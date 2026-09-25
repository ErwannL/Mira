import type { Browser } from 'playwright';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../app/db/pool.js';
import { EventWriter } from '../app/db/events.js';
import { DbMemoryStore } from '../app/db/memory.js';
import { saveReport } from '../app/db/misc.js';
import { heartbeat, isCancelRequested, transition, type RunRow } from '../app/db/runs.js';
import type { Plan } from '../shared/plans.js';
import { simulate, type SimulationSummary } from './engine/simulate.js';
import { buildReports } from './build-reports.js';
import type { SimData } from './data.js';
import { apiDrivers, browserDrivers, clonesOf, initialVars, newCredentials, selectPersonas } from './modes.js';
import { OrqeaClient, type Endpoint, type TargetInfo } from './target/client.js';
import { checkDrift } from './target/drift.js';
import { guardTarget } from './target/guard.js';

export interface WorkerConfig {
  workerId: string;
  serviceSecret: string;
  dataKey: Buffer;
  screenshotsDir: string;
  localHosts: string[];
  productionHosts: string[];
  caps: { accounts: number; requestsPerSecond: number; rows: number };
  stepTimeoutMs: number;
  cancelPollMs: number;
  /** Rough rows a synthetic account creates on the target (for the VOLUME_CAP estimate). */
  rowsPerAccount: number;
}

export interface WorkerDeps {
  db: Db;
  data: SimData;
  fetchImpl: typeof fetch;
  launch: () => Promise<Browser>;
  nowS: () => number;
}

interface Prepared {
  client: OrqeaClient;
  info: TargetInfo;
  endpoints: Endpoint[];
}

/** preparing: guard (refusal = nothing touched), then drift check. Returns null if refused/failed. */
async function prepare(run: RunRow, cfg: WorkerConfig, deps: WorkerDeps, client: OrqeaClient): Promise<Prepared | null> {
  const c = run.config;
  const personas = selectPersonas(deps.data.personas, c.personaIds);
  const accounts = c.kind === 'journey' ? personas.length : clonesOf(personas, c.targetUsers).length;
  const guard = await guardTarget(
    {
      targetUrl: c.targetUrl,
      allowRemote: c.allowRemote,
      confirmHost: c.confirmHost,
      localHosts: cfg.localHosts,
      productionHosts: cfg.productionHosts,
      requested: { accounts, requestsPerSecond: c.kind === 'volume' ? cfg.caps.requestsPerSecond : 5, rows: accounts * cfg.rowsPerAccount },
      caps: cfg.caps,
    },
    client,
  );
  if (!guard.ok) {
    await transition(deps.db, run.id, 'refused', cfg.workerId, guard.code, { refusal_code: guard.code, refusal_message: guard.message });
    return null;
  }
  const drift = checkDrift(deps.data.catalogue, guard.endpoints);
  if (drift.missing.length > 0) {
    const detail = drift.missing.map((m) => `${m.useCase}: ${m.method} ${m.path}`).join('; ');
    await transition(deps.db, run.id, 'failed', cfg.workerId, 'catalogue drift', { error: `CATALOGUE_DRIFT: ${detail}` });
    return null;
  }
  return { client, info: guard.info, endpoints: guard.endpoints };
}

export async function executeRun(run: RunRow, cfg: WorkerConfig, deps: WorkerDeps): Promise<RunRow> {
  const client = new OrqeaClient({ baseUrl: run.config.targetUrl.replace(/\/$/, ''), serviceSecret: cfg.serviceSecret, runId: run.id, fetchImpl: deps.fetchImpl, nowS: deps.nowS });
  const prepared = await prepare(run, cfg, deps, client);
  if (!prepared) return run;
  let error: string | null = null;
  let summary: Record<string, unknown> = {};
  let cancelled = false;
  try {
    const result = await simulateRun(run, cfg, deps, prepared);
    cancelled = result.summary.stopped;
    summary = { ...result.summary, plans: result.plans.length };
    if (!cancelled) {
      await transition(deps.db, run.id, 'reporting', cfg.workerId);
      const started = run.started_at ?? new Date();
      await buildReports(deps.db, run, deps.data, prepared, result.plans, Date.now() - started.getTime());
    }
  } catch (e) {
    error = (e as Error).message;
  }
  return finish(run, cfg, deps, prepared.client, { error, summary, cancelled });
}

async function simulateRun(run: RunRow, cfg: WorkerConfig, deps: WorkerDeps, prepared: Prepared): Promise<{ summary: SimulationSummary; plans: Plan[] }> {
  const c = run.config;
  if (c.fakeScenario !== null) await prepared.client.setScenario(c.fakeScenario);
  await transition(deps.db, run.id, 'running', cfg.workerId, null, {
    catalogue_version: deps.data.catalogue.version,
    weights_version: deps.data.weights.version,
    target_version: prepared.info.version,
  });
  const plans = await prepared.client.plans();
  const selected = selectPersonas(deps.data.personas, c.personaIds);
  const personas = c.kind === 'journey' ? selected : clonesOf(selected, c.targetUsers);
  const runHeader = () => prepared.client.runHeader();
  const drivers = c.kind === 'journey'
    ? await browserDrivers(c, run.id, deps.data, { launch: deps.launch, runHeader, screenshotsDir: cfg.screenshotsDir, stepTimeoutMs: cfg.stepTimeoutMs })
    : apiDrivers(c, { runHeader, fetchImpl: deps.fetchImpl, requestsPerSecond: cfg.caps.requestsPerSecond });
  let stop = false;
  const poll = setInterval(() => {
    void isCancelRequested(deps.db, run.id).then((v) => (stop = stop || v));
    void heartbeat(deps.db, run.id);
  }, cfg.cancelPollMs);
  const writer = new EventWriter(deps.db, run.id);
  try {
    const summary = await simulate(
      { seed: run.seed, personas, start: new Date(c.startAt), totalSimulatedDays: c.totalSimulatedDays, minutesPerRound: c.minutesPerRound, timeConfig: deps.data.time },
      {
        catalogue: deps.data.catalogue,
        weights: deps.data.weights,
        target: { requestVerifyUrl: (email) => prepared.client.requestVerifyUrl(email), plans: async () => plans },
        recorder: writer,
        openDriver: drivers.openDriver,
        shouldStop: () => stop,
        now: () => new Date(),
        allowCheckout: c.allowCheckout && prepared.info.stripeMode === 'test',
        memoryStore: new DbMemoryStore(deps.db, run.id, cfg.dataKey),
        newCredentials: newCredentials(run.id),
        initialVars: initialVars(run.id),
      },
    );
    return { summary, plans };
  } finally {
    clearInterval(poll);
    await writer.flush();
    await drivers.close();
  }
}

/** cleaning always runs; residual rows on the target mean a failed run. */
async function finish(run: RunRow, cfg: WorkerConfig, deps: WorkerDeps, client: OrqeaClient, o: { error: string | null; summary: Record<string, unknown>; cancelled: boolean }): Promise<RunRow> {
  await transition(deps.db, run.id, 'cleaning', cfg.workerId);
  let error = o.error;
  try {
    const cleanup = await client.cleanup();
    o.summary.cleanup = cleanup;
    if (cleanup.residualRows > 0) error = error ?? `CLEANUP_INCOMPLETE: ${cleanup.residualRows} residual rows`;
  } catch (e) {
    error = error ?? `CLEANUP_FAILED: ${(e as Error).message}`;
  }
  const final = error ? 'failed' : o.cancelled ? 'cancelled' : 'done';
  return transition(deps.db, run.id, final, cfg.workerId, error, { error, summary: o.summary });
}

/** Deleting a run purges its screenshots too. */
export function purgeScreenshots(screenshotsDir: string, runId: string): void {
  rmSync(join(screenshotsDir, runId), { recursive: true, force: true });
}
