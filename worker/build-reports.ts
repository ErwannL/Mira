import type { Db } from '../app/db/pool.js';
import { eventsOf } from '../app/db/events.js';
import { memoriesOf } from '../app/db/memory.js';
import { saveReport } from '../app/db/misc.js';
import type { RunRow } from '../app/db/runs.js';
import type { Plan } from '../shared/plans.js';
import type { SimData } from './data.js';
import { selectPersonas } from './modes.js';
import { buildFunnel } from './reports/funnel.js';
import { buildLoad } from './reports/load.js';
import { buildMeta } from './reports/meta.js';
import { buildPricing } from './reports/pricing.js';
import type { Endpoint, TargetInfo } from './target/client.js';

export const REPORT_KINDS = { journey: ['funnel', 'load', 'pricing'], volume: ['load'] } as const;

/** reporting: deterministic reports from persisted events and memories. */
export async function buildReports(db: Db, run: RunRow, data: SimData, target: { info: TargetInfo; endpoints: Endpoint[] }, plans: Plan[], durationMs: number): Promise<void> {
  const c = run.config;
  const personas = selectPersonas(data.personas, c.personaIds);
  const events = await eventsOf(db, run.id);
  const meta = buildMeta(
    {
      runId: run.id,
      kind: c.kind,
      seed: run.seed,
      catalogueVersion: data.catalogue.version,
      weightsVersion: data.weights.version,
      targetVersion: target.info.version,
      targetUrl: c.targetUrl,
      simulatedDays: c.totalSimulatedDays,
      durationMs,
    },
    personas,
  );
  await saveReport(db, run.id, 'load', buildLoad(meta, personas, events, data.time, c.userScenarios));
  if (c.kind === 'volume') return;
  const memories = await memoriesOf(db, run.id);
  await saveReport(db, run.id, 'funnel', buildFunnel(meta, data.catalogue, personas, events, memories, target.endpoints));
  await saveReport(db, run.id, 'pricing', buildPricing(meta, personas, memories, plans, c.priceScenarios));
}
