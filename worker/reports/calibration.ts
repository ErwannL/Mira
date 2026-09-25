import { z } from 'zod';
import type { FunnelReport } from './funnel.js';
import { round4 } from './stats.js';

/** Real aggregates: share (0..1) of real users reaching each headline step. */
export const realAggregatesSchema = z
  .object({ funnel: z.record(z.string(), z.number().min(0).max(1)) })
  .strict()
  .refine((a) => Object.keys(a.funnel).length > 0, 'at least one step is required');
export type RealAggregates = z.infer<typeof realAggregatesSchema>;

/** Parses "step,share" CSV (header optional) or JSON. */
export function parseAggregates(text: string): RealAggregates {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return realAggregatesSchema.parse(JSON.parse(trimmed));
  const funnel: Record<string, number> = {};
  for (const line of trimmed.split(/\r?\n/)) {
    const [step, share] = line.split(',').map((s) => s.trim()) as [string, string | undefined];
    if (!step || step === 'step') continue;
    funnel[step] = Number(share);
  }
  return realAggregatesSchema.parse({ funnel });
}

export interface CalibrationReport {
  type: 'calibration';
  runId: string;
  rows: { step: string; simulated: number; real: number | null; delta: number | null }[];
  suggestions: { personaId: string; direction: 'increase' | 'decrease'; because: string }[];
  note: string;
}

/** Compares simulated vs real funnel and suggests (never applies) persona-weight changes. */
export function buildCalibration(funnel: FunnelReport, real: RealAggregates, tolerance = 0.1): CalibrationReport {
  const rows = funnel.headline.map((h) => {
    const r = real.funnel[h.id];
    return { step: h.id, simulated: h.weightedShare, real: r ?? null, delta: r === undefined ? null : round4(h.weightedShare - r) };
  });
  const suggestions: CalibrationReport['suggestions'] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.delta === null || Math.abs(row.delta) <= tolerance) continue;
    const tooOptimistic = row.delta > 0;
    for (const p of funnel.personas) {
      const passed = p.succeeded.includes(row.step);
      // Too optimistic: weigh up those who stop, down those who pass (and vice versa).
      const direction = passed === tooOptimistic ? 'decrease' : 'increase';
      const k = `${p.id}:${direction}`;
      if (seen.has(k)) continue;
      seen.add(k);
      suggestions.push({
        personaId: p.id,
        direction,
        because: `${row.step}: simulated ${row.simulated} vs real ${row.real} — this persona ${passed ? 'passes' : 'stops before'} it`,
      });
    }
  }
  return { type: 'calibration', runId: funnel.meta.runId, rows, suggestions, note: 'Suggestions only: persona weights are never changed automatically.' };
}
