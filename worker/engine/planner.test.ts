import { describe, expect, it } from 'vitest';
import { createPrng } from '../../shared/prng.js';
import { catalogue, persona } from '../../shared/test-helpers/fixtures.js';
import { newMemory } from './journey.js';
import { goalsReached, isCritical, lifeGoals, NOT_EXPLORED, sessionPlan } from './planner.js';

const always = { ...createPrng(1), chance: () => true, pick: <T>(xs: readonly T[]) => xs[0] as T };
const never = { ...createPrng(1), chance: () => false };

describe('planner', () => {
  it('critical steps are the acquisition ones', () => {
    expect(isCritical(catalogue.useCases.find((u) => u.id === 'signup')!)).toBe(true);
    expect(isCritical(catalogue.useCases.find((u) => u.id === 'comment')!)).toBe(false);
  });
  it('adds onboarding for tutorial lovers or when it is a goal', () => {
    const dev = persona('junior-developer');
    expect(lifeGoals(dev, never)[0]).toBe('create-board');
    expect(lifeGoals(dev, always)[0]).toBe('onboarding');
    expect(lifeGoals(persona('project-manager'), never)[0]).toBe('onboarding');
  });
  it('first session plans acquisition, later sessions start with login and skip done work', () => {
    const p = persona('student');
    const m = newMemory(p, {});
    const first = sessionPlan(m, ['create-board'], p, catalogue, never).map((u) => u.id);
    expect(first).toEqual(['landing', 'signup', 'verify-email', 'login', 'create-board']);
    m.succeeded.push('landing', 'signup', 'verify-email', 'login');
    m.skipped.push('create-board');
    expect(sessionPlan(m, ['create-board'], p, catalogue, never).map((u) => u.id)).toEqual(['login']);
  });
  it('curiosity adds one explorable use case whose prerequisites are met, never destructive ones', () => {
    const p = persona('student');
    const m = newMemory(p, {});
    m.succeeded.push('landing', 'signup', 'verify-email', 'login');
    const plan = sessionPlan(m, [], p, catalogue, always).map((u) => u.id);
    expect(plan).toHaveLength(2);
    expect(NOT_EXPLORED.has(plan[1]!)).toBe(false);
    const nothing = newMemory(p, {});
    nothing.succeeded.push(...catalogue.useCases.map((u) => u.id));
    expect(sessionPlan(nothing, [], p, catalogue, always).map((u) => u.id)).toEqual(['login']);
  });
  it('goals are reached when succeeded or skipped', () => {
    const m = newMemory(persona('student'), {});
    expect(goalsReached(m, ['a'])).toBe(false);
    m.skipped.push('a');
    expect(goalsReached(m, ['a'])).toBe(true);
    m.succeeded.push('b');
    expect(goalsReached(m, ['a', 'b'])).toBe(true);
  });
});
