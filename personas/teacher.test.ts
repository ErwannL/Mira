import { describe, expect, it } from 'vitest';
import { persona, reaction } from './test-helpers/persona-test.js';

const id = 'teacher';

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
      techSavvy: 0.4,
      patience: 0.55,
      frictionTolerance: 0.45,
      budget: 5,
      teamSize: 30,
      populationWeight: 0.1,
    });
  });

  it('is put off by privacy prompts combined with extra fields', () => {
    expect(
      reaction(id, { cookieBanner: true, termsCheckbox: true, visibleFields: 7, captcha: true }),
    ).toBe('abandon');
  });
});
