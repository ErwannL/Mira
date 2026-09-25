import { describe, expect, it } from 'vitest';
import { runConfigSchema, TRANSITIONS, RUN_STATUSES, FINAL_STATUSES } from './run-config.js';

describe('run config', () => {
  it('applies safe defaults', () => {
    const c = runConfigSchema.parse({ kind: 'journey', targetUrl: 'http://localhost:4100' });
    expect(c).toMatchObject({ allowRemote: false, confirmHost: null, allowCheckout: false, seed: null, totalSimulatedDays: 7 });
  });
  it('rejects unknown keys and bad values', () => {
    expect(() => runConfigSchema.parse({ kind: 'journey', targetUrl: 'x' })).toThrow();
    expect(() => runConfigSchema.parse({ kind: 'journey', targetUrl: 'http://a', force: true })).toThrow();
  });
  it('final states have no way out; every state can be reached', () => {
    for (const s of FINAL_STATUSES) expect(TRANSITIONS[s]).toEqual([]);
    const reachable = new Set(Object.values(TRANSITIONS).flat());
    expect(RUN_STATUSES.filter((s) => s !== 'draft' && !reachable.has(s))).toEqual([]);
  });
});
