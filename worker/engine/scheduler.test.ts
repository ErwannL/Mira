import { describe, expect, it } from 'vitest';
import { createPrng } from '../../shared/prng.js';
import { persona, timeConfig } from '../../shared/test-helpers/fixtures.js';
import {
  activationProbability,
  hourMultiplier,
  isActive,
  localHour,
  roundTimes,
} from './scheduler.js';

const pm = persona('project-manager'); // Europe/Berlin

describe('scheduler', () => {
  it('computes local hours across zones', () => {
    const at = new Date('2026-01-05T08:00:00Z');
    expect(localHour(at, 'Europe/Berlin')).toBe(9);
    expect(localHour(at, 'America/Chicago')).toBe(2);
    expect(localHour(new Date('2026-01-05T23:30:00Z'), 'UTC')).toBe(23);
  });
  it('applies hour multipliers', () => {
    expect(hourMultiplier(9, timeConfig)).toBe(timeConfig.multipliers.peak);
    expect(hourMultiplier(8, timeConfig)).toBe(timeConfig.multipliers.work);
    expect(hourMultiplier(6, timeConfig)).toBe(timeConfig.multipliers.morning);
    expect(hourMultiplier(3, timeConfig)).toBe(timeConfig.multipliers.offPeak);
  });
  it('is far more likely inside active hours, and capped at 1', () => {
    const inside = activationProbability(pm, new Date('2026-01-05T08:00:00Z'), 60, timeConfig);
    const outside = activationProbability(pm, new Date('2026-01-05T01:00:00Z'), 60, timeConfig);
    expect(inside).toBeGreaterThan(outside * 10);
    expect(
      activationProbability(
        { ...pm, sessionsPerWeek: 1000 },
        new Date('2026-01-05T08:00:00Z'),
        60,
        timeConfig,
      ),
    ).toBe(1);
  });
  it('expected weekly sessions track sessionsPerWeek', () => {
    const times = roundTimes(new Date('2026-01-05T00:00:00Z'), 7, 60);
    const expected = times.reduce((s, t) => s + activationProbability(pm, t, 60, timeConfig), 0);
    expect(expected).toBeGreaterThan(pm.sessionsPerWeek * 0.8);
    expect(expected).toBeLessThan(pm.sessionsPerWeek * 2.5);
  });
  it('isActive is seeded', () => {
    const at = new Date('2026-01-05T08:00:00Z');
    const a = isActive(pm, at, 60, timeConfig, createPrng(5));
    expect(a).toEqual(isActive(pm, at, 60, timeConfig, createPrng(5)));
    expect(a.localHour).toBe(9);
    expect(
      isActive({ ...pm, sessionsPerWeek: 1000 }, at, 60, timeConfig, createPrng(5)).active,
    ).toBe(true);
    expect(isActive({ ...pm, sessionsPerWeek: 0 }, at, 60, timeConfig, createPrng(5)).active).toBe(
      false,
    );
  });
  it('lists round instants', () => {
    const t = roundTimes(new Date('2026-01-05T00:00:00Z'), 1, 30);
    expect(t).toHaveLength(48);
    expect(t[1]!.toISOString()).toBe('2026-01-05T00:30:00.000Z');
  });
});
