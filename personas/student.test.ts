import { describe, expect, it } from 'vitest';
import { money, persona, reaction } from './test-helpers/persona-test.js';

const id = 'student';

describe(`persona ${id}`, () => {
  it('pins its traits', () => {
    const p = persona(id);
    expect({
      locale: p.locale,
      device: p.device,
      techSavvy: p.techSavvy,
      patience: p.patience,
      frictionTolerance: p.frictionTolerance,
      budget: p.budget,
      teamSize: p.teamSize,
      populationWeight: p.populationWeight,
    }).toEqual({
      locale: 'en',
      device: 'mobile',
      techSavvy: 0.55,
      patience: 0.45,
      frictionTolerance: 0.4,
      budget: 3,
      teamSize: 4,
      populationWeight: 0.16,
    });
  });

  it('churns or defers rather than paying for a paid feature', () => {
    expect(money(id, 'bulk')).not.toBe('convert');
  });

  it('shrugs off a cookie banner on mobile', () => {
    expect(reaction(id, { cookieBanner: true })).toBe('continue');
  });
});
