import { describe, expect, it } from 'vitest';
import {
  isProductionEnv,
  personaFromVigie,
  personasOfSet,
  setIdOf,
  slug,
  targetNameOf,
  useCaseOf,
  vigiePersonaSetSchema,
  vigieScenarioSchema,
} from './vigie.js';
import { PERSONA_SET, SCENARIO } from './test-helpers/vigie.js';

const known = (id: string) => ['create-board', 'create-card', 'move-card', 'stats'].includes(id);

describe('Vigie shapes', () => {
  it("accepts Vigie's example scenario and refuses unknown actions or empty steps", () => {
    expect(vigieScenarioSchema.parse(SCENARIO).steps[2]!.expect).toEqual({
      maxDurationMs: 340,
      status: 200,
    });
    expect(() =>
      vigieScenarioSchema.parse({ ...SCENARIO, steps: [{ action: 'hover', target: 'x' }] }),
    ).toThrow();
    expect(() => vigieScenarioSchema.parse({ ...SCENARIO, steps: [] })).toThrow();
  });

  it('maps targets, production and feature keys', () => {
    expect([targetNameOf('dev'), targetNameOf('DEV'), targetNameOf('recette')]).toEqual([
      'local',
      'local',
      'recette',
    ]);
    expect(['prod', 'Production', 'live'].every(isProductionEnv)).toBe(true);
    expect(isProductionEnv('recette')).toBe(false);
    expect(useCaseOf('card.create', known)).toBe('create-card');
    expect(useCaseOf('stats', known)).toBe('stats');
    expect(useCaseOf('list.create', known)).toBeNull();
    expect([slug('Pro Mobile!'), slug('***')]).toEqual(['pro-mobile', 'x']);
  });
});

describe('personas from Vigie', () => {
  it('builds catalogue-valid personas from traits and weights', () => {
    const set = vigiePersonaSetSchema.parse(PERSONA_SET);
    const [free, pro] = personasOfSet(set, known);
    expect(free).toMatchObject({
      id: 'vigie-free-desktop',
      displayName: 'Vigie free-desktop',
      locale: 'fr',
      device: 'desktop',
      timezone: 'Europe/Paris',
      goalFeatures: ['create-board', 'create-card', 'move-card'],
      budget: 10,
      sessionLengthMin: 3,
      frictionTolerance: 0.74,
      populationWeight: 0.75,
    });
    expect(pro).toMatchObject({
      id: 'vigie-pro-mobile',
      locale: 'en',
      device: 'mobile',
      budget: 60,
      teamSize: 5,
      goalFeatures: ['create-board'],
      frictionTolerance: 0.6,
      sessionLengthMin: 15,
      populationWeight: 0.25,
    });
  });

  it('laptops, missing samples and a zero-people set', () => {
    const p = personaFromVigie(
      'vigie-x',
      'x',
      { traits: { plan: 'team', device: 'Laptop', locale: 'fr-CA' } },
      { known, populationWeight: 2 },
    );
    expect([p.device, p.locale, p.populationWeight]).toEqual(['laptop', 'fr', 1]);
    const set = vigiePersonaSetSchema.parse({
      ...PERSONA_SET,
      personas: [
        { name: 'a', traits: { plan: 'free', device: 'desktop', locale: 'en' } },
        {
          name: 'b',
          traits: { plan: 'free', device: 'desktop', locale: 'en' },
          sample: { people: 0 },
        },
      ],
    });
    expect(personasOfSet(set, known).map((q) => q.populationWeight)).toEqual([1, 0]);
    const empty = { ...set, personas: [{ ...set.personas[1]! }] };
    expect(personasOfSet(empty, known)[0]!.populationWeight).toBe(0);
  });

  it('a set is identified by its content', () => {
    const set = vigiePersonaSetSchema.parse(PERSONA_SET);
    expect(setIdOf(set)).toBe(setIdOf(vigiePersonaSetSchema.parse(PERSONA_SET)));
    expect(setIdOf({ ...set, targetEnv: 'dev' })).not.toBe(setIdOf(set));
    expect(setIdOf(set)).toMatch(/^[0-9a-f]{32}$/);
  });
});
