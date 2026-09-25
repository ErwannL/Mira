import { describe, expect, it } from 'vitest';
import { persona } from '../../shared/test-helpers/fixtures.js';
import type { Plan } from '../../shared/plans.js';
import { costFor, decideMoney, reprice } from './money.js';

const plans: Plan[] = [
  { key: 'free', name: 'Free', priceMonthly: 0, currency: 'EUR', perSeat: false, features: [] },
  { key: 'pro', name: 'Pro', priceMonthly: 9, currency: 'EUR', perSeat: false, features: ['automation', 'qr'] },
  { key: 'team', name: 'Team', priceMonthly: 4, currency: 'EUR', perSeat: true, features: ['automation', 'bulk'] },
];
const enc = (featureKey: string | null, neededFeatures: string[], satisfaction = 1) => ({
  featureKey,
  neededFeatures,
  satisfaction,
});

describe('money', () => {
  it('costs per seat', () => {
    expect(costFor(plans[2]!, persona('agency'))).toBe(80);
    expect(costFor(plans[1]!, persona('agency'))).toBe(9);
  });
  it('converts when affordable and valuable (cheapest plan wins)', () => {
    const out = decideMoney(enc('automation', ['automation']), plans, persona('project-manager'));
    expect(out).toMatchObject({ decision: 'convert', planKey: 'pro', monthlyCost: 9 });
    expect(out.rule).toContain('≤ stretch budget');
  });
  it('defers when affordable but not valuable enough', () => {
    const out = decideMoney(enc('qr', []), plans, persona('freelance-designer'));
    expect(out.decision).toBe('defer');
    expect(out.perceivedValue).toBeLessThan(0.5);
  });
  it('churns when unaffordable and not valuable, defers when unaffordable but valuable', () => {
    expect(decideMoney(enc('qr', ['qr'], 0), plans, persona('retired-volunteer')).decision).toBe('churn');
    const rich = { ...persona('retired-volunteer'), valueThreshold: 0.1 };
    const out = decideMoney(enc('qr', ['qr']), plans, rich);
    expect(out.decision).toBe('defer');
    expect(out.rule).toContain('> stretch budget 0');
  });
  it('pricing page visit considers all needed features; no need ⇒ defer', () => {
    expect(decideMoney(enc(null, ['bulk']), plans, persona('agency')).planKey).toBe('team');
    expect(decideMoney(enc(null, []), plans, persona('agency'))).toMatchObject({ decision: 'defer', planKey: null });
  });
  it('reprices only listed plans', () => {
    const r = reprice(plans, { pro: 3 });
    expect(r.map((p) => p.priceMonthly)).toEqual([0, 3, 4]);
  });
});
