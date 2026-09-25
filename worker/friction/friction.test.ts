import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { emptyFacts, type Facts } from '../../shared/facts.js';
import { persona, personas, weights } from '../../shared/test-helpers/fixtures.js';
import {
  accumulate,
  betweenSessions,
  frictionOf,
  relieve,
  round,
  RULES,
  toleranceOf,
} from './friction.js';

const ctx = { expectedClicks: 2, learned: false };
const volunteer = persona('retired-volunteer');
const lead = persona('tech-lead');
const reader = persona('screen-reader-user');

describe('frictionOf', () => {
  it('is zero on a frictionless page', () => {
    expect(frictionOf(emptyFacts(), lead, weights, ctx)).toEqual({ score: 0, reasons: [], hardBlock: null });
  });

  it('fires every rule on the worst page and caps at 1', () => {
    const worst: Facts = {
      visibleFields: 12,
      requiredFields: 10,
      visibleWords: 5000,
      clicksToGoal: 20,
      timeToInteractiveMs: 60_000,
      networkErrors: 2,
      validationErrors: 2,
      unclearErrors: 2,
      unnamedControls: 3,
      captcha: true,
      cookieBanner: true,
      termsCheckbox: true,
      paywall: true,
      horizontalOverflow: true,
      foreignText: true,
      targetUnnamed: false,
    };
    const r = frictionOf(worst, volunteer, weights, ctx);
    expect(r.score).toBe(1);
    expect(r.reasons.map((x) => x.code).sort()).toEqual(Object.keys(RULES).sort());
    expect(r.reasons[0]!.value).toBeGreaterThanOrEqual(r.reasons.at(-1)!.value);
  });

  it('weighs facts by traits', () => {
    const f = emptyFacts({ visibleFields: 6 });
    expect(frictionOf(f, volunteer, weights, ctx).score).toBeGreaterThan(frictionOf(f, lead, weights, ctx).score);
    const overflow = emptyFacts({ horizontalOverflow: true });
    expect(frictionOf(overflow, volunteer, weights, ctx).score).toBe(weights.overflowMobile);
    expect(frictionOf(overflow, lead, weights, ctx).score).toBe(weights.overflowOther);
  });

  it('text budget grows with reading tolerance', () => {
    const f = emptyFacts({ visibleWords: 200 });
    expect(frictionOf(f, persona('junior-developer'), weights, ctx).score).toBeGreaterThan(0);
    expect(frictionOf(f, persona('project-manager'), weights, ctx).score).toBe(0);
  });

  it('knowing where a feature lives reduces friction', () => {
    const f = emptyFacts({ clicksToGoal: 8 });
    const fresh = frictionOf(f, volunteer, weights, ctx).score;
    const learned = frictionOf(f, volunteer, weights, { ...ctx, learned: true }).score;
    expect(learned).toBeCloseTo(fresh * weights.learnedFactor, 3);
  });

  it('screen reader: unnamed controls weigh triple and a needed unnamed control hard-blocks', () => {
    const f = emptyFacts({ unnamedControls: 1 });
    expect(frictionOf(f, reader, weights, ctx).score).toBeCloseTo(3 * frictionOf(f, lead, weights, ctx).score, 6);
    const blocked = frictionOf(emptyFacts({ targetUnnamed: true }), reader, weights, ctx);
    expect(blocked.hardBlock).toBe('control-without-accessible-name');
    expect(frictionOf(emptyFacts({ targetUnnamed: true }), lead, weights, ctx).hardBlock).toBeNull();
  });

  it('score stays within [0,1] for any facts and persona (property)', () => {
    const facts = fc.record({
      visibleFields: fc.nat(50),
      requiredFields: fc.nat(50),
      visibleWords: fc.nat(10000),
      clicksToGoal: fc.nat(50),
      timeToInteractiveMs: fc.nat(100000),
      networkErrors: fc.nat(5),
      validationErrors: fc.nat(5),
      unclearErrors: fc.nat(5),
      unnamedControls: fc.nat(10),
      captcha: fc.boolean(),
      cookieBanner: fc.boolean(),
      termsCheckbox: fc.boolean(),
      paywall: fc.boolean(),
      horizontalOverflow: fc.boolean(),
      foreignText: fc.boolean(),
      targetUnnamed: fc.boolean(),
    });
    fc.assert(
      fc.property(facts, fc.constantFrom(...personas), (f, p) => {
        const r = frictionOf(f, p, weights, ctx);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe('frustration dynamics', () => {
  it('accumulates with decay and never goes negative (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true })), (scores) => {
        let f = 0;
        for (const s of scores) {
          f = accumulate(f, s, weights);
          expect(f).toBeGreaterThanOrEqual(0);
          f = relieve(f, weights);
          expect(f).toBeGreaterThanOrEqual(0);
        }
      }),
    );
    expect(accumulate(1, 0.5, weights)).toBe(round(weights.decayPerStep + 0.5));
    expect(relieve(0.01, weights)).toBe(0);
    expect(betweenSessions(1, weights)).toBe(weights.decayPerSession);
  });

  it('tolerance grows with frictionTolerance', () => {
    expect(toleranceOf(volunteer, weights)).toBeLessThan(toleranceOf(persona('project-manager'), weights));
  });
});
