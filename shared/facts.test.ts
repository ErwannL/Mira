import { describe, expect, it } from 'vitest';
import { emptyFacts, mergeFacts } from './facts.js';

describe('facts', () => {
  it('builds empty facts with overrides', () => {
    expect(emptyFacts().visibleFields).toBe(0);
    expect(emptyFacts({ captcha: true }).captcha).toBe(true);
  });
  it('merges: max sizes, summed counts, OR flags', () => {
    const a = emptyFacts({ visibleFields: 4, clicksToGoal: 1, networkErrors: 1, captcha: true });
    const b = emptyFacts({ visibleFields: 2, clicksToGoal: 2, networkErrors: 2, paywall: true, targetUnnamed: true });
    const m = mergeFacts(a, b);
    expect(m).toMatchObject({ visibleFields: 4, clicksToGoal: 3, networkErrors: 3, captcha: true, paywall: true });
    expect(m.targetUnnamed).toBe(true);
    expect(mergeFacts(b, a).captcha).toBe(true);
  });
});
