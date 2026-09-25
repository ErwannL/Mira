import { describe, expect, it } from 'vitest';
import { en, fr, translate } from './i18n.js';

describe('i18n', () => {
  it('has the same keys and placeholders in both languages', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(ph(fr[k]), k).toEqual(ph(en[k]));
    }
  });
  it('translates with parameters and keeps unknown placeholders', () => {
    expect(translate('fr', 'run.title', { id: 'abc' })).toBe('Simulation abc');
    expect(translate('en', 'report.load.users', { n: 100 })).toBe('100 users');
    expect(translate('en', 'app.error')).toBe('Something failed: {detail}');
  });
});
