import { emptyFacts, type Facts } from '../../shared/facts.js';
import { createPrng } from '../../shared/prng.js';
import { persona, weights } from '../../shared/test-helpers/fixtures.js';
import { decide } from '../../worker/friction/decide.js';
import { accumulate, frictionOf } from '../../worker/friction/friction.js';
import { decideMoney } from '../../worker/friction/money.js';
import { PLANS } from '../../fake-orqea/api/plans.js';

export { persona };

/** Decision of a persona on a single fresh step with the given facts (from zero frustration). */
export function reaction(
  id: string,
  facts: Partial<Facts>,
  o: { failed?: boolean; critical?: boolean; expectedClicks?: number } = {},
) {
  const p = persona(id);
  const friction = frictionOf(emptyFacts(facts), p, weights, {
    expectedClicks: o.expectedClicks ?? 2,
    learned: false,
  });
  const frustration = accumulate(0, friction.score, weights);
  return decide(
    {
      frustration,
      friction,
      stepFailed: o.failed ?? false,
      attempts: 1,
      critical: o.critical ?? true,
    },
    p,
    weights,
    createPrng(1),
  ).action;
}

/** Money decision against the fake Orqea's plans. */
export function money(id: string, featureKey: string | null, satisfaction = 1) {
  const p = persona(id);
  return decideMoney(
    { featureKey, neededFeatures: [featureKey ?? 'advancedAnalytics'], satisfaction },
    PLANS,
    p,
  ).decision;
}
