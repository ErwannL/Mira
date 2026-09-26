import { z } from 'zod';

/**
 * The plan shape Figura reasons with (docs/ORQEA_CONTRACT.md §2). Orqea adds these readable fields
 * next to its own; `priceMonthly: null` is a quote-based plan (Enterprise, "contact sales"): shown,
 * never bought by a persona.
 */
const contractPlanSchema = z.object({
  key: z.string(),
  name: z.string(),
  priceMonthly: z.number().min(0).nullable(),
  currency: z.string(),
  perSeat: z.boolean(),
  features: z.array(z.string()),
});

/**
 * Orqea's own plan fields (`backend/src/billing/plans.js` `publicPlan()`), accepted alone for an
 * Orqea that predates the readable fields: amounts in cents under `displayAmount` (null = on
 * quote), a currency only once Stripe priced the plan, features as `{featureKey: boolean}`.
 */
const orqeaPlanSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    displayAmount: z.object({ month: z.number().min(0).nullable().optional() }),
    currency: z.string().optional(),
    entitlements: z.object({ features: z.record(z.string(), z.boolean()) }),
  })
  .transform((p) => ({
    key: p.key,
    name: p.name,
    priceMonthly: typeof p.displayAmount.month === 'number' ? p.displayAmount.month / 100 : null,
    // Orqea's pricing page falls back to USD when Stripe has not priced the plan.
    currency: (p.currency ?? 'usd').toUpperCase(),
    perSeat: false,
    features: Object.entries(p.entitlements.features)
      .filter(([, on]) => on)
      .map(([k]) => k),
  }));

/** Either shape is accepted; both come out as the contract shape. */
export const planSchema = z.union([contractPlanSchema, orqeaPlanSchema]);
export const plansResponseSchema = z.object({ plans: z.array(planSchema) });
export type Plan = z.output<typeof contractPlanSchema>;
/** A plan a persona can pay for by itself: a known price above zero. */
export type BuyablePlan = Plan & { priceMonthly: number };
export const isBuyable = (p: Plan): p is BuyablePlan =>
  p.priceMonthly !== null && p.priceMonthly > 0;
