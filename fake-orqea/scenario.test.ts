import { describe, expect, it } from 'vitest';
import { PRESETS, resolveScenario, ScenarioRegistry } from './scenario.js';

describe('scenario', () => {
  it('resolves presets and overrides', () => {
    expect(resolveScenario('improved').cookieBanner).toBe(false);
    expect(resolveScenario({ captcha: true }).captcha).toBe(true);
    expect(resolveScenario({ preset: 'slow', captcha: true })).toMatchObject({
      slowMs: 4000,
      captcha: true,
    });
    expect(() => resolveScenario('nope')).toThrow('Unknown scenario preset');
    expect(() => resolveScenario({ bogus: 1 })).toThrow();
  });
  it('keeps scenarios per run with a fallback', () => {
    const r = new ScenarioRegistry(PRESETS.baseline!);
    r.set('a', PRESETS.slow!);
    expect(r.get('a').slowMs).toBe(4000);
    expect(r.get('b')).toBe(PRESETS.baseline);
    expect(r.get(null)).toBe(PRESETS.baseline);
    r.delete('a');
    expect(r.get('a')).toBe(PRESETS.baseline);
  });
});
