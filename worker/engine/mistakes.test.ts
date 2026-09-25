import { describe, expect, it } from 'vitest';
import { createPrng } from '../../shared/prng.js';
import { catalogue, persona } from '../../shared/test-helpers/fixtures.js';
import { applyMistakes, fixMistakes, pickMistakes, skipsStep } from './mistakes.js';

const signup = catalogue.useCases.find((u) => u.id === 'signup')!;
const landing = catalogue.useCases.find((u) => u.id === 'landing')!;
const always = { ...createPrng(1), chance: () => true };
const never = { ...createPrng(1), chance: () => false };

describe('mistakes', () => {
  it('picks allowed mistakes only', () => {
    expect(pickMistakes(signup, persona('retired-volunteer'), always)).toEqual(['typoEmail', 'weakPassword', 'forgetTerms']);
    expect(pickMistakes(signup, persona('retired-volunteer'), never)).toEqual([]);
    expect(pickMistakes(landing, persona('retired-volunteer'), always)).toEqual([]);
  });
  it('clear messages fix everything; unclear ones depend on techSavvy', () => {
    const p = persona('retired-volunteer');
    expect(fixMistakes(['typoEmail'], false, p, never)).toEqual([]);
    expect(fixMistakes(['typoEmail'], true, p, never)).toEqual(['typoEmail']);
    expect(fixMistakes(['typoEmail'], true, p, always)).toEqual([]);
  });
  it('applies mistakes to typed values', () => {
    expect(applyMistakes('{{email}}', 'a@b.c', ['typoEmail'])).toBe('ab.c');
    expect(applyMistakes('{{email}}', 'a@b.c', [])).toBe('a@b.c');
    expect(applyMistakes('{{password}}', 'Str0ng!', ['weakPassword'])).toBe('12345');
    expect(applyMistakes('{{boardName}}', 'x', ['typoEmail', 'weakPassword'])).toBe('x');
  });
  it('forgetting the terms skips checkbox steps', () => {
    expect(skipsStep('checkbox', ['forgetTerms'])).toBe(true);
    expect(skipsStep('checkbox', [])).toBe(false);
    expect(skipsStep('button', ['forgetTerms'])).toBe(false);
  });
});
