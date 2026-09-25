import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createPrng } from '../../shared/prng.js';
import { persona, personas, weights } from '../../shared/test-helpers/fixtures.js';
import { decide, type DecisionInput } from './decide.js';

const pm = persona('project-manager');
const none = { score: 0, reasons: [], hardBlock: null };
const base: DecisionInput = {
  frustration: 0,
  friction: none,
  stepFailed: false,
  attempts: 1,
  critical: true,
};
const fixed = (v: number) => ({ ...createPrng(1), next: () => v });

describe('decide', () => {
  it('hard blocks abandon whatever the frustration', () => {
    const d = decide(
      { ...base, friction: { ...none, hardBlock: 'x' } },
      pm,
      weights,
      createPrng(1),
    );
    expect(d).toEqual({ action: 'abandon', rule: 'hard block: x' });
  });
  it('abandons at or above tolerance, naming the numbers', () => {
    const d = decide({ ...base, frustration: 0.9 }, pm, weights, createPrng(1));
    expect(d.action).toBe('abandon');
    expect(d.rule).toContain('≥ tolerance 0.77');
  });
  it('continues after success below tolerance', () => {
    expect(decide(base, pm, weights, createPrng(1)).action).toBe('continue');
  });
  it('retries when the recovery roll passes', () => {
    const d = decide({ ...base, stepFailed: true }, pm, weights, fixed(0));
    expect(d.action).toBe('retry');
    expect(d.rule).toContain('retry roll 0 < recovery 0.8');
  });
  it('abandons a critical step or skips an optional one when the roll fails', () => {
    expect(decide({ ...base, stepFailed: true }, pm, weights, fixed(0.99)).action).toBe('abandon');
    expect(
      decide({ ...base, stepFailed: true, critical: false }, pm, weights, fixed(0.99)).action,
    ).toBe('skip');
  });
  it('stops retrying after maxRetries', () => {
    const tired = { ...base, stepFailed: true, attempts: weights.maxRetries + 1 };
    expect(decide(tired, pm, weights, fixed(0)).action).toBe('abandon');
    expect(decide({ ...tired, critical: false }, pm, weights, fixed(0)).action).toBe('skip');
  });
  it('same seed ⇒ same decisions (property)', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        fc.constantFrom(...personas),
        (seed, frustration, failed, p) => {
          const input = { ...base, frustration, stepFailed: failed };
          expect(decide(input, p, weights, createPrng(seed))).toEqual(
            decide(input, p, weights, createPrng(seed)),
          );
        },
      ),
    );
  });
});
