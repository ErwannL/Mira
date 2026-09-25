import type { Persona } from '../../shared/persona-schema.js';
import type { Prng } from '../../shared/prng.js';
import type { FrictionWeights } from '../../shared/weights.js';
import { round, toleranceOf, type FrictionResult } from './friction.js';

export type Action = 'continue' | 'retry' | 'skip' | 'abandon';

export interface Decision {
  action: Action;
  /** The exact rule that decided — shown verbatim in the persona inspector. */
  rule: string;
}

export interface DecisionInput {
  frustration: number;
  friction: FrictionResult;
  stepFailed: boolean;
  attempts: number;
  /** A step on the persona's critical path (signup, login…) cannot be skipped. */
  critical: boolean;
}

export function decide(
  input: DecisionInput,
  persona: Persona,
  weights: FrictionWeights,
  prng: Prng,
): Decision {
  const tolerance = toleranceOf(persona, weights);
  if (input.friction.hardBlock) {
    return { action: 'abandon', rule: `hard block: ${input.friction.hardBlock}` };
  }
  if (input.frustration >= tolerance) {
    return {
      action: 'abandon',
      rule: `frustration ${round(input.frustration)} ≥ tolerance ${tolerance} (${weights.toleranceBase} + ${weights.toleranceScale} × frictionTolerance)`,
    };
  }
  if (!input.stepFailed) {
    return {
      action: 'continue',
      rule: `step succeeded, frustration ${round(input.frustration)} < ${tolerance}`,
    };
  }
  if (input.attempts <= weights.maxRetries) {
    const p = round(persona.recoveryWillingness * (1 - input.frustration / tolerance));
    const roll = prng.next();
    if (roll < p) {
      return { action: 'retry', rule: `failed; retry roll ${round(roll)} < recovery ${p}` };
    }
    if (input.critical) {
      return {
        action: 'abandon',
        rule: `failed on critical step; retry roll ${round(roll)} ≥ recovery ${p}`,
      };
    }
    return {
      action: 'skip',
      rule: `failed; retry roll ${round(roll)} ≥ recovery ${p}; optional step skipped`,
    };
  }
  if (input.critical) {
    return {
      action: 'abandon',
      rule: `failed ${input.attempts} times on a critical step (max ${weights.maxRetries} retries)`,
    };
  }
  return {
    action: 'skip',
    rule: `failed ${input.attempts} times (max ${weights.maxRetries} retries); skipped`,
  };
}
