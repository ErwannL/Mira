import { describe, expect, it } from 'vitest';
import { emptyFacts } from '../../shared/facts.js';
import { createPrng } from '../../shared/prng.js';
import { catalogue, persona } from '../../shared/test-helpers/fixtures.js';
import { journeyDeps, ScriptedDriver } from '../test-helpers/scripted.js';
import {
  checkoutAllowed,
  isFinal,
  neededFeatures,
  newMemory,
  runSession,
  type Life,
} from './journey.js';
import type { Persona } from '../../shared/persona-schema.js';

const sim = new Date('2030-01-06T09:00:00Z');
function life(p: Persona, seed = 1): Life {
  return {
    persona: p,
    prng: createPrng(seed).fork(p.id),
    memory: newMemory(p, { boardName: 'B', cardTitle: 'C' }),
    credentials: { email: `synth+r1-${p.id}@synthetic.invalid`, password: 'Str0ng!pass' },
  };
}
const calm: Persona = {
  ...persona('project-manager'),
  errorProneness: 0,
  curiosity: 0,
  sessionLengthMin: 999,
};

describe('runSession', () => {
  it('lives a frictionless life to the end, in prerequisite order', async () => {
    const driver = new ScriptedDriver((uc) =>
      uc.id === 'create-board' ? { captured: { boardId: 'b1' }, pages: ['/boards'] } : {},
    );
    const { deps, events } = journeyDeps(driver);
    const l = life(calm);
    await runSession(l, sim, deps);
    expect(l.memory.stage).toBe('done');
    expect(driver.calls.map((c) => c.id).slice(0, 5)).toEqual([
      'landing',
      'signup',
      'verify-email',
      'login',
      'onboarding',
    ]);
    expect(l.memory.vars.boardId).toBe('b1');
    expect(l.memory.vars.verifyToken).toBe(`tok-${l.credentials.email}`);
    expect(l.memory.pagesSeen).toEqual(['/boards']);
    expect(driver.closed).toBe(1);
    expect(events[0]!.kind).toBe('session');
    expect(events.at(-1)!.kind).toBe('life-end');
    // billing-checkout is recorded, not performed, when checkout is not enabled
    expect(events.find((e) => e.useCaseId === 'billing-checkout')!.rule).toContain('recorded only');
    await runSession(l, sim, deps);
    expect(l.memory.sessions).toBe(1);
  });

  it('persona 1 abandons a signup form with more than 5 visible fields and completes a clear one', async () => {
    const volunteer = { ...persona('retired-volunteer'), errorProneness: 0 };
    const run = async (fields: number) => {
      const driver = new ScriptedDriver((uc) =>
        uc.id === 'signup'
          ? {
              facts: emptyFacts({
                visibleFields: fields,
                requiredFields: fields,
                termsCheckbox: true,
              }),
            }
          : {},
      );
      const l = life(volunteer);
      await runSession(l, sim, journeyDeps(driver).deps);
      return l.memory;
    };
    const unclear = await run(6);
    expect(unclear.stage).toBe('abandoned');
    expect(unclear.succeeded).toEqual(['landing']);
    const clear = await run(3);
    expect(clear.succeeded).toContain('signup');
  });

  it('recovers from a mistake through a clear error message, fails through an unclear one', async () => {
    const proneTo = { ...calm, errorProneness: 1, techSavvy: 0, recoveryWillingness: 1 };
    const script = (unclear: number) =>
      new ScriptedDriver((uc, ctx) =>
        uc.id === 'signup' && ctx.mistakes.length > 0
          ? {
              ok: false,
              error: 'validation',
              facts: emptyFacts({ validationErrors: 1, unclearErrors: unclear }),
            }
          : {},
      );
    const clear = life(proneTo, 3);
    const clearDriver = script(0);
    await runSession(clear, sim, journeyDeps(clearDriver, { now: () => sim }).deps);
    expect(clear.memory.succeeded).toContain('signup');
    expect(clear.memory.errorsMet[0]).toEqual({ useCase: 'signup', code: 'validation' });
    const muddled = life(proneTo, 3);
    const muddledDriver = script(1);
    await runSession(muddled, sim, journeyDeps(muddledDriver).deps);
    expect(muddled.memory.stage).toBe('abandoned');
    expect(muddled.memory.errorsMet.length).toBeGreaterThan(0);
  });

  it('failure without an error code is recorded as failed; optional steps are skipped', async () => {
    const driver = new ScriptedDriver((uc) => (uc.id === 'create-list' ? { ok: false } : {}));
    const l = life({ ...calm, recoveryWillingness: 0 });
    await runSession(l, sim, journeyDeps(driver).deps);
    expect(l.memory.errorsMet).toContainEqual({ useCase: 'create-list', code: 'failed' });
    expect(l.memory.skipped).toContain('create-list');
  });

  it('skips dependants whose prerequisite failed', async () => {
    const driver = new ScriptedDriver((uc) => (uc.id === 'create-board' ? { ok: false } : {}));
    const { deps, events } = journeyDeps(driver);
    const l = life({ ...calm, recoveryWillingness: 0 });
    await runSession(l, sim, deps);
    expect(events.find((e) => e.useCaseId === 'create-card')!.rule).toBe(
      'skipped: prerequisite create-board not met',
    );
  });

  it('paywall: convert is recorded and the locked step skipped; checkout then runs when enabled', async () => {
    const driver = new ScriptedDriver((uc) =>
      uc.id === 'stats'
        ? {
            ok: false,
            paywall: { code: 'FEATURE_LOCKED', featureKey: 'advancedAnalytics' },
            facts: emptyFacts({ paywall: true }),
          }
        : {},
    );
    const { deps, events } = journeyDeps(driver, { allowCheckout: true });
    const l = life(calm);
    await runSession(l, sim, deps);
    const pay = events.find((e) => e.useCaseId === 'stats')!;
    expect(pay.action).toBe('skip');
    expect(pay.money!.decision).toBe('convert');
    expect(l.memory.vars.planName).toBe('Pro');
    expect(driver.calls.map((c) => c.id)).toContain('billing-checkout');
    expect(checkoutAllowed(l, deps)).toBeNull();
    expect(checkoutAllowed(life(calm), deps)).toBe('no conversion decision yet');
  });

  it('paywall churn ends the life; pricing page defer continues', async () => {
    const broke = { ...calm, budget: 0, valueThreshold: 1 };
    const driver = new ScriptedDriver((uc) =>
      uc.id === 'stats'
        ? { ok: false, paywall: { code: 'FEATURE_LOCKED', featureKey: 'advancedAnalytics' } }
        : {},
    );
    const l = life(broke);
    await runSession(l, sim, journeyDeps(driver).deps);
    expect(l.memory.stage).toBe('churned');
    expect(isFinal(l.memory)).toBe(true);
    const pricing = l.memory.money.find((m) => m.encounter.featureKey === null);
    expect(pricing).toBeUndefined();
  });

  it('paywall on an already frustrated persona abandons', async () => {
    const driver = new ScriptedDriver((uc) =>
      uc.id === 'stats'
        ? {
            ok: false,
            paywall: { code: 'PLAN_LIMIT', featureKey: 'advancedAnalytics' },
            facts: emptyFacts({ networkErrors: 4 }),
          }
        : {},
    );
    const l = life(calm);
    await runSession(l, sim, journeyDeps(driver).deps);
    expect(l.memory.stage).toBe('abandoned');
  });

  it('pricing page visit records a money decision and continues', async () => {
    const agency = { ...persona('agency'), errorProneness: 0, curiosity: 0, sessionLengthMin: 999 };
    const driver = new ScriptedDriver();
    const { deps, events } = journeyDeps(driver);
    const l = life(agency);
    await runSession(l, sim, deps);
    const e = events.find((x) => x.useCaseId === 'billing-view-plans')!;
    expect(e.action).toBe('continue');
    expect(e.money).not.toBeNull();
  });

  it('stops on cancel and when the session budget is spent', async () => {
    const driver = new ScriptedDriver();
    const l = life(calm);
    await runSession(l, sim, journeyDeps(driver, { shouldStop: () => true }).deps);
    expect(driver.calls).toHaveLength(0);
    const short = life({ ...calm, sessionLengthMin: 2 });
    const d2 = new ScriptedDriver();
    await runSession(short, sim, journeyDeps(d2).deps);
    expect(d2.calls.map((c) => c.id)).toEqual(['landing', 'signup']);
    // next session starts with login only once it succeeded; here it did not yet
    expect(short.memory.stage).toBe('active');
  });

  it('closes the driver even when a step throws', async () => {
    const driver = new ScriptedDriver(() => {
      throw new Error('boom');
    });
    await expect(runSession(life(calm), sim, journeyDeps(driver).deps)).rejects.toThrow('boom');
    expect(driver.closed).toBe(1);
  });

  it('logs in again at the start of later sessions and explores with curiosity', async () => {
    const curious = { ...calm, curiosity: 1, sessionLengthMin: 6 };
    const driver = new ScriptedDriver();
    const l = life(curious);
    const { deps } = journeyDeps(driver);
    await runSession(l, sim, deps);
    await runSession(l, sim, deps);
    const second = driver.calls.slice(driver.calls.findIndex((c) => c.ctx.label.includes('-s2-')));
    expect(second[0]!.id).toBe('login');
  });

  it('an unreachable target fails the life as an infrastructure error, with no friction recorded', async () => {
    const driver = new ScriptedDriver((uc) =>
      uc.id === 'signup'
        ? { ok: false, unreachable: true, error: 'net::ERR_CONNECTION_REFUSED' }
        : {},
    );
    const { deps, events } = journeyDeps(driver);
    const l = life(calm);
    await expect(runSession(l, sim, deps)).rejects.toThrow(
      'TARGET_UNREACHABLE: signup: net::ERR_CONNECTION_REFUSED',
    );
    expect(events.some((e) => e.useCaseId === 'signup')).toBe(false);
    expect(l.memory.errorsMet).toEqual([]);
    expect(driver.closed).toBe(1);
  });

  it('computes needed paid features from goals', () => {
    expect(neededFeatures(persona('project-manager'), catalogue)).toEqual(['advancedAnalytics']);
    expect(neededFeatures(persona('retired-volunteer'), catalogue)).toEqual([]);
  });

  it('a verify URL without token yields an empty token', async () => {
    const driver = new ScriptedDriver();
    const l = life({ ...calm, sessionLengthMin: 5 });
    await runSession(
      l,
      sim,
      journeyDeps(driver, {
        target: { requestVerifyUrl: async () => 'http://t/verify', plans: async () => [] },
      }).deps,
    );
    expect(l.memory.vars.verifyToken).toBe('');
  });
});
