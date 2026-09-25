import { describe, expect, it } from 'vitest';
import { money, persona, reaction } from './test-helpers/persona-test.js';

const id = 'tech-lead';

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
      techSavvy: 1,
      patience: 0.5,
      frictionTolerance: 0.55,
      budget: 60,
      teamSize: 10,
      populationWeight: 0.07,
    });
  });

  it('has a high value threshold: an unsatisfying product does not convert her', () => {
    expect(money(id, 'automation', 0)).not.toBe('convert');
  });

  it('tolerates dense UIs', () => {
    expect(reaction(id, { visibleFields: 8, visibleWords: 300 })).toBe('continue');
  });
});
