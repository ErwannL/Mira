import { describe, expect, it } from 'vitest';
import { isBuyable, plansResponseSchema } from './plans.js';

/** Orqea's own plan fields, as an Orqea without the readable ones answers. */
const orqea = (
  key: string,
  month: number | null,
  features: Record<string, boolean>,
  currency?: string,
) => ({
  key,
  name: key.toUpperCase(),
  order: 0,
  displayAmount: { month, year: null },
  prices: { month: null, year: null },
  entitlements: { features, limits: {} },
  ...(currency ? { currency } : {}),
});

describe('plans', () => {
  it("reads Orqea's own fields when the readable ones are absent", () => {
    const { plans } = plansResponseSchema.parse({
      plans: [
        orqea('free', 0, { qrCodes: false }),
        orqea('pro', 900, { qrCodes: true, aiAgents: true }, 'eur'),
        orqea('enterprise', null, { qrCodes: true }),
      ],
    });
    expect(plans).toEqual([
      { key: 'free', name: 'FREE', priceMonthly: 0, currency: 'USD', perSeat: false, features: [] },
      {
        key: 'pro',
        name: 'PRO',
        priceMonthly: 9,
        currency: 'EUR',
        perSeat: false,
        features: ['qrCodes', 'aiAgents'],
      },
      {
        key: 'enterprise',
        name: 'ENTERPRISE',
        priceMonthly: null,
        currency: 'USD',
        perSeat: false,
        features: ['qrCodes'],
      },
    ]);
  });

  it('prefers the readable fields; a quote-based or free plan is not buyable', () => {
    const readable = {
      ...orqea('team', 2900, { qrCodes: true }),
      priceMonthly: 29,
      currency: 'USD',
      perSeat: true,
      features: ['qrCodes'],
    };
    const [team] = plansResponseSchema.parse({ plans: [readable] }).plans;
    expect(team).toMatchObject({ priceMonthly: 29, perSeat: true });
    expect(isBuyable(team!)).toBe(true);
    expect(isBuyable({ ...team!, priceMonthly: null })).toBe(false);
    expect(isBuyable({ ...team!, priceMonthly: 0 })).toBe(false);
    expect(() => plansResponseSchema.parse({ plans: [{ key: 'x' }] })).toThrow();
  });
});
