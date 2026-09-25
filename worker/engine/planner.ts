import type { Catalogue, UseCase } from '../../shared/catalogue-schema.js';
import { orderWithPrerequisites } from '../../shared/loaders.js';
import type { Persona } from '../../shared/persona-schema.js';
import type { Prng } from '../../shared/prng.js';
import type { Memory } from './types.js';

/** Use cases never chosen by curiosity: destructive or money-moving. */
export const NOT_EXPLORED = new Set(['account-delete', 'billing-checkout']);
/** Re-done at the start of every session after the first one. */
export const SESSION_START = 'login';

export function isCritical(useCase: UseCase): boolean {
  return useCase.area === 'acquisition';
}

/** Goals in order: onboarding first when the persona likes tutorials (decided once, seeded). */
export function lifeGoals(persona: Persona, prng: Prng): string[] {
  const goals = persona.goalFeatures.filter((g) => g !== 'onboarding');
  const wantsTutorial = persona.goalFeatures.includes('onboarding') || prng.chance(persona.tutorialAffinity);
  return wantsTutorial ? ['onboarding', ...goals] : goals;
}

export function sessionPlan(
  memory: Memory,
  goals: string[],
  persona: Persona,
  catalogue: Catalogue,
  prng: Prng,
): UseCase[] {
  const done = new Set([...memory.succeeded, ...memory.skipped]);
  const planned = orderWithPrerequisites(catalogue, goals).filter((u) => !done.has(u.id));
  const plan: UseCase[] = [];
  if (memory.succeeded.includes(SESSION_START)) {
    plan.push(catalogue.useCases.find((u) => u.id === SESSION_START) as UseCase);
  }
  plan.push(...planned);
  if (prng.chance(persona.curiosity)) {
    const known = new Set([...done, ...plan.map((u) => u.id)]);
    const explorable = catalogue.useCases.filter(
      (u) => !known.has(u.id) && !NOT_EXPLORED.has(u.id) && u.requires.every((r) => memory.succeeded.includes(r)),
    );
    if (explorable.length > 0) plan.push(prng.pick(explorable));
  }
  return plan;
}

export function goalsReached(memory: Memory, goals: string[]): boolean {
  return goals.every((g) => memory.succeeded.includes(g) || memory.skipped.includes(g));
}
