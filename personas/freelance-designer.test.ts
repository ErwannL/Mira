import { describe, expect, it } from 'vitest';
import { money, persona } from './test-helpers/persona-test.js';

const id = 'freelance-designer';

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
      device: 'laptop',
      techSavvy: 0.6,
      patience: 0.5,
      frictionTolerance: 0.45,
      budget: 15,
      teamSize: 1,
      populationWeight: 0.1,
    });
  });

  it('pays for QR codes she needs when she is satisfied', () => {
    expect(money(id, 'qr')).toBe('convert');
  });
});
