import { describe, expect, it } from 'vitest';
import { persona, reaction } from './test-helpers/persona-test.js';

const id = 'junior-developer';

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
      device: 'laptop',
      techSavvy: 0.85,
      patience: 0.4,
      frictionTolerance: 0.5,
      budget: 10,
      teamSize: 5,
      populationWeight: 0.13,
    });
  });

  it('hates long text', () => {
    const r = reaction(id, {
      visibleWords: 900,
      visibleFields: 7,
      clicksToGoal: 6,
      unclearErrors: 1,
    });
    expect(r).toBe('abandon');
  });
});
