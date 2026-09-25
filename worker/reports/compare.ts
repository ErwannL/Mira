import type { FunnelReport } from './funnel.js';
import { round4 } from './stats.js';

export interface ComparisonReport {
  type: 'comparison';
  a: FunnelReport['meta'];
  b: FunnelReport['meta'];
  sameSeed: boolean;
  frictionDelta: { id: string; a: number | null; b: number | null; delta: number | null }[];
  funnelDelta: { id: string; a: number; b: number; delta: number }[];
  hurt: { personaId: string; useCaseId: string; why: string }[];
  helped: { personaId: string; useCaseId: string; why: string }[];
}

/** Change reaction: same seed and personas against two targets or two scenarios. */
export function buildComparison(
  a: FunnelReport,
  b: FunnelReport,
  threshold = 0.1,
): ComparisonReport {
  const byId = new Map(b.useCases.map((u) => [u.id, u]));
  const hurt: ComparisonReport['hurt'] = [];
  const helped: ComparisonReport['helped'] = [];
  const frictionDelta = a.useCases.map((ua) => {
    const ub = byId.get(ua.id);
    const fb = ub?.medianFriction ?? null;
    for (const [pid, ca] of Object.entries(ua.personas)) {
      const cb = ub?.personas[pid];
      if (!cb) continue;
      if (ca.succeeded && !cb.succeeded)
        hurt.push({
          personaId: pid,
          useCaseId: ua.id,
          why: cb.abandoned ? 'abandoned in B' : 'no longer succeeds in B',
        });
      else if (!ca.succeeded && cb.succeeded)
        helped.push({ personaId: pid, useCaseId: ua.id, why: 'succeeds only in B' });
      else if (
        ca.medianFriction !== null &&
        cb.medianFriction !== null &&
        cb.medianFriction - ca.medianFriction >= threshold
      ) {
        hurt.push({
          personaId: pid,
          useCaseId: ua.id,
          why: `friction +${round4(cb.medianFriction - ca.medianFriction)}`,
        });
      }
    }
    return {
      id: ua.id,
      a: ua.medianFriction,
      b: fb,
      delta: ua.medianFriction === null || fb === null ? null : round4(fb - ua.medianFriction),
    };
  });
  const funnelDelta = a.headline.map((ha, i) => {
    const hb = b.headline[i] as { weightedShare: number };
    return {
      id: ha.id,
      a: ha.weightedShare,
      b: hb.weightedShare,
      delta: round4(hb.weightedShare - ha.weightedShare),
    };
  });
  return {
    type: 'comparison',
    a: a.meta,
    b: b.meta,
    sameSeed: a.meta.seed === b.meta.seed,
    frictionDelta,
    funnelDelta,
    hurt,
    helped,
  };
}
