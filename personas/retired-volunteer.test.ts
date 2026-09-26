import { describe, expect, it } from 'vitest';
import { money, persona, reaction } from './test-helpers/persona-test.js';

const id = 'retired-volunteer';

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
      device: 'mobile',
      techSavvy: 0.1,
      patience: 0.2,
      frictionTolerance: 0.15,
      budget: 0,
      teamSize: 6,
      populationWeight: 0.08,
    });
  });

  it('abandons a signup form with more than 5 visible fields', () => {
    expect(reaction(id, { visibleFields: 6, requiredFields: 6, termsCheckbox: true })).toBe(
      'abandon',
    );
    expect(reaction(id, { visibleFields: 3, requiredFields: 3, termsCheckbox: true })).toBe(
      'continue',
    );
  });

  it('never pays (budget 0)', () => {
    expect(money(id, 'qrCodes')).not.toBe('convert');
  });
});
