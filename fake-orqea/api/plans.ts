/**
 * Orqea's plan catalogue as `GET /api/billing/plans` returns it: its own fields
 * (`backend/src/billing/plans.js` `publicPlan()`, amounts in cents, entitlements) plus the readable
 * fields of the Figura contract (`readablePlanFields()`). Enterprise is quote-based:
 * `priceMonthly: null`.
 */
const FEATURES = [
  'aiAgents',
  'integrations',
  'encryption',
  'advancedAnalytics',
  'qrCodes',
] as const;

function plan(key: string, name: string, order: number, cents: number | null, on: string[]) {
  const features = Object.fromEntries(FEATURES.map((f) => [f, on.includes(f)]));
  return {
    key,
    name,
    order,
    displayAmount: { month: cents, year: cents === null ? null : cents * 10 },
    prices: { month: null, year: null },
    entitlements: { features, limits: {} },
    priceMonthly: cents === null ? null : cents / 100,
    currency: 'USD',
    perSeat: false,
    features: FEATURES.filter((f) => on.includes(f)),
  };
}

export const PLANS = [
  plan('free', 'Free', 0, 0, []),
  plan('pro', 'Pro', 1, 900, ['aiAgents', 'integrations', 'advancedAnalytics', 'qrCodes']),
  plan('team', 'Team', 2, 2900, [...FEATURES]),
  plan('enterprise', 'Enterprise', 3, null, [...FEATURES]),
];
