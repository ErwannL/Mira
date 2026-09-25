import { describe, expect, it } from 'vitest';
import { persona, reaction } from './test-helpers/persona-test.js';

const id = 'screen-reader-user';

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
      patience: 0.6,
      frictionTolerance: 0.5,
      budget: 10,
      teamSize: 3,
      populationWeight: 0.04,
    });
  });

  it('abandons when a needed control has no accessible name', () => {
    expect(reaction(id, { targetUnnamed: true })).toBe('abandon');
    expect(reaction(id, {})).toBe('continue');
  });

  it('navigates by keyboard only', () => {
    expect(persona(id).assistive).toEqual({ screenReader: true, keyboardOnly: true });
  });
});
