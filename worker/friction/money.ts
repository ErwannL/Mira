import type { Persona } from '../../shared/persona-schema.js';
import { isBuyable, type BuyablePlan, type Plan } from '../../shared/plans.js';
import { round } from './friction.js';

export type MoneyDecision = 'convert' | 'defer' | 'churn';

/** Everything a money decision depends on — stored so reports can replay it under other prices. */
export interface MoneyEncounter {
  /** Paid feature key behind the paywall, or null for a voluntary visit to the pricing page. */
  featureKey: string | null;
  /** Feature keys the persona's goals need (derived from the catalogue plan gates). */
  neededFeatures: string[];
  /** Share of attempted use cases that succeeded so far. */
  satisfaction: number;
}

export interface MoneyOutcome {
  decision: MoneyDecision;
  planKey: string | null;
  monthlyCost: number;
  perceivedValue: number;
  rule: string;
}

export function costFor(plan: BuyablePlan, persona: Persona): number {
  return round(plan.perSeat ? plan.priceMonthly * persona.teamSize : plan.priceMonthly);
}

export function decideMoney(
  encounter: MoneyEncounter,
  plans: Plan[],
  persona: Persona,
): MoneyOutcome {
  const wanted = encounter.featureKey ? [encounter.featureKey] : encounter.neededFeatures;
  const answering = plans.filter((p) => wanted.some((f) => p.features.includes(f)));
  const candidates = answering
    .filter(isBuyable)
    .sort((a, b) => costFor(a, persona) - costFor(b, persona));
  const plan = candidates[0];
  if (!plan) {
    // A quote-based plan ("contact sales") is not something a persona buys on the spot.
    const quoted = answering.some((p) => p.priceMonthly === null);
    return {
      decision: 'defer',
      planKey: null,
      monthlyCost: 0,
      perceivedValue: 0,
      rule: quoted ? 'only a quote-based plan answers the need' : 'no paid plan answers a need',
    };
  }
  const need = wanted.some((f) => encounter.neededFeatures.includes(f)) ? 1 : 0.3;
  const perceivedValue = round(need * (0.5 + 0.3 * encounter.satisfaction + 0.2 * persona.urgency));
  const cost = costFor(plan, persona);
  const stretch = round(persona.budget * (1 + 0.5 * (1 - persona.priceSensitivity)));
  const base = { planKey: plan.key, monthlyCost: cost, perceivedValue };
  if (cost > stretch) {
    const decision = perceivedValue >= persona.valueThreshold ? 'defer' : 'churn';
    return {
      ...base,
      decision,
      rule: `cost ${cost} > stretch budget ${stretch}; value ${perceivedValue} vs threshold ${persona.valueThreshold} ⇒ ${decision}`,
    };
  }
  const decision = perceivedValue >= persona.valueThreshold ? 'convert' : 'defer';
  return {
    ...base,
    decision,
    rule: `cost ${cost} ≤ stretch budget ${stretch}; value ${perceivedValue} vs threshold ${persona.valueThreshold} ⇒ ${decision}`,
  };
}

/** Re-prices a plan list for a pricing scenario (operator alternatives). */
export function reprice(plans: Plan[], prices: Record<string, number>): Plan[] {
  return plans.map((p) => (p.key in prices ? { ...p, priceMonthly: prices[p.key] as number } : p));
}
