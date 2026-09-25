import type { Persona } from '../../shared/persona-schema.js';
import type { Plan } from '../../shared/plans.js';
import { decideMoney, reprice, type MoneyDecision } from '../friction/money.js';
import type { Memory } from '../engine/types.js';
import type { ReportMeta } from './meta.js';
import { countBy, round4 } from './stats.js';

export interface PricingReport {
  type: 'pricing';
  meta: ReportMeta;
  plans: Plan[];
  scenarios: {
    name: string;
    prices: Record<string, number>;
    personas: { id: string; decision: MoneyDecision | 'no-encounter'; planKey: string | null; monthlyCost: number }[];
    weightedConversion: number;
    revenuePer1000Users: number;
  }[];
  paywallTriggers: { featureKey: string; count: number }[];
}

/** Replays every recorded money encounter under the target's prices and operator alternatives. */
export function buildPricing(meta: ReportMeta, personas: Persona[], memories: Memory[], plans: Plan[], alternatives: { name: string; prices: Record<string, number> }[]): PricingReport {
  const memo = new Map(memories.map((m) => [m.personaId, m]));
  const scenarios = [{ name: 'target', prices: {} as Record<string, number> }, ...alternatives].map((s) => {
    const priced = reprice(plans, s.prices);
    const rows = personas.map((p) => {
      const outcomes = (memo.get(p.id)?.money ?? []).map((m) => decideMoney(m.encounter, priced, p));
      const convert = outcomes.find((o) => o.decision === 'convert');
      const decision = convert ? 'convert' : outcomes.some((o) => o.decision === 'churn') ? 'churn' : outcomes.length ? 'defer' : 'no-encounter';
      return { id: p.id, decision: decision as MoneyDecision | 'no-encounter', planKey: convert?.planKey ?? null, monthlyCost: convert?.monthlyCost ?? 0, weight: p.populationWeight };
    });
    const converted = rows.filter((r) => r.decision === 'convert');
    return {
      name: s.name,
      prices: s.prices,
      personas: rows.map(({ weight: _w, ...r }) => r),
      weightedConversion: round4(converted.reduce((a, r) => a + r.weight, 0)),
      revenuePer1000Users: round4(converted.reduce((a, r) => a + r.weight * 1000 * r.monthlyCost, 0)),
    };
  });
  const triggers = countBy(memories.flatMap((m) => m.money.filter((x) => x.encounter.featureKey !== null)), (x) => x.encounter.featureKey as string);
  return {
    type: 'pricing',
    meta,
    plans,
    scenarios,
    paywallTriggers: Object.entries(triggers).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([featureKey, count]) => ({ featureKey, count })),
  };
}
