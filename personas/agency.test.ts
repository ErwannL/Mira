import { describe, expect, it } from 'vitest';
import { money, persona } from './test-helpers/persona-test.js';

const id = 'agency';

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
      techSavvy: 0.7,
      patience: 0.55,
      frictionTolerance: 0.6,
      budget: 150,
      teamSize: 20,
      populationWeight: 0.06,
    });
  });

  it('pays for seats-heavy features within its budget', () => {
    expect(money(id, 'bulk')).toBe('convert');
  });
});
