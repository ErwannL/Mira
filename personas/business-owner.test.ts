import { describe, expect, it } from 'vitest';
import { persona, reaction } from './test-helpers/persona-test.js';

const id = 'business-owner';

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
      locale: 'fr',
      device: 'desktop',
      techSavvy: 0.35,
      patience: 0.2,
      frictionTolerance: 0.3,
      budget: 30,
      teamSize: 8,
      populationWeight: 0.12,
    });
  });

  it('is impatient: a slow page plus extra clicks makes him leave', () => {
    expect(reaction(id, { timeToInteractiveMs: 9000, clicksToGoal: 8, networkErrors: 1 })).toBe(
      'abandon',
    );
  });
});
