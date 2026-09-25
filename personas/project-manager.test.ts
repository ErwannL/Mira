import { describe, expect, it } from 'vitest';
import { money, persona, reaction } from './test-helpers/persona-test.js';

const id = 'project-manager';

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
      device: 'desktop',
      techSavvy: 0.65,
      patience: 0.75,
      frictionTolerance: 0.65,
      budget: 80,
      teamSize: 15,
      populationWeight: 0.14,
    });
  });

  it('reads everything: a long page does not bother her', () => {
    expect(reaction(id, { visibleWords: 450 })).toBe('continue');
  });

  it('buys automation', () => {
    expect(money(id, 'automation')).toBe('convert');
  });
});
