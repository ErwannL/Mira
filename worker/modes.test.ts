import { describe, expect, it } from 'vitest';
import { personas } from '../shared/test-helpers/fixtures.js';
import { clonesOf, initialVars, newCredentials, selectPersonas } from './modes.js';

describe('modes', () => {
  it('selects personas and renormalises their weights', () => {
    expect(selectPersonas(personas, [])).toHaveLength(10);
    const two = selectPersonas(personas, ['student', 'agency']);
    expect(two.map((p) => p.id)).toEqual(['agency', 'student']);
    expect(two.reduce((s, p) => s + p.populationWeight, 0)).toBeCloseTo(1, 10);
    expect(() => selectPersonas(personas, ['ghost', 'student'])).toThrow('Unknown personas: ghost');
  });
  it('clones populationWeight × targetUsers accounts per persona (at least one)', () => {
    const c = clonesOf(selectPersonas(personas, ['student', 'agency']), 10);
    expect(c.map((p) => p.id)).toEqual(['agency-c1', 'agency-c2', 'agency-c3', 'student-c1', 'student-c2', 'student-c3', 'student-c4', 'student-c5', 'student-c6', 'student-c7']);
    expect(clonesOf(selectPersonas(personas, ['agency']), 0.1 as number)).toHaveLength(1);
  });
  it('credentials follow the synthetic email scheme with random passwords', () => {
    const make = newCredentials('r1');
    const a = make(personas[0]!);
    expect(a.email).toBe(`synth+r1-${personas[0]!.id}@synthetic.invalid`);
    expect(make({ ...personas[0]!, id: 'student-c3' }).email).toBe('synth+r1-student-3@synthetic.invalid');
    expect(make(personas[0]!).password).not.toBe(a.password);
  });
  it('initial variables are localised', () => {
    const vars = initialVars('r1');
    expect(vars(selectPersonas(personas, ['teacher'])[0]!).boardName).toBe('Tableau teacher');
    expect(vars(selectPersonas(personas, ['student'])[0]!)).toEqual({ boardName: 'Board student', cardTitle: 'First task', inviteEmail: 'synth+r1-guest@synthetic.invalid' });
  });
});
