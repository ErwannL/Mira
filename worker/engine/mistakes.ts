import type { UseCase } from '../../shared/catalogue-schema.js';
import type { Persona } from '../../shared/persona-schema.js';
import type { Prng } from '../../shared/prng.js';
import type { Mistake } from './types.js';

/** With probability errorProneness (per allowed mistake) the persona makes it. */
export function pickMistakes(useCase: UseCase, persona: Persona, prng: Prng): Mistake[] {
  return (useCase.mistakes ?? []).filter(() => prng.chance(persona.errorProneness * 0.5));
}

/**
 * After an error page, the persona fixes each mistake if the message was clear; with an unclear
 * message it only guesses right with probability techSavvy.
 */
export function fixMistakes(mistakes: Mistake[], unclear: boolean, persona: Persona, prng: Prng): Mistake[] {
  if (!unclear) return [];
  return mistakes.filter(() => !prng.chance(persona.techSavvy));
}

/** Applies a mistake to a typed value. */
export function applyMistakes(template: string, value: string, mistakes: Mistake[]): string {
  if (template === '{{email}}' && mistakes.includes('typoEmail')) return value.replace('@', '');
  if (template === '{{password}}' && mistakes.includes('weakPassword')) return '12345';
  return value;
}

export function skipsStep(role: string, mistakes: Mistake[]): boolean {
  return role === 'checkbox' && mistakes.includes('forgetTerms');
}
