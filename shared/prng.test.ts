import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createPrng, hashString, newSeed } from './prng.js';

describe('prng', () => {
  it('is deterministic for a seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const a = createPrng(seed);
        const b = createPrng(seed);
        for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
      }),
    );
  });

  it('stays in [0,1) and int stays in range', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: -50, max: 50 }), (seed, min) => {
        const p = createPrng(seed);
        const v = p.next();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
        const n = p.int(min, min + 5);
        expect(n).toBeGreaterThanOrEqual(min);
        expect(n).toBeLessThanOrEqual(min + 5);
      }),
    );
  });

  it('differs between seeds and pins a known value', () => {
    expect(createPrng(1).next()).not.toBe(createPrng(2).next());
    expect(createPrng(42).next()).toBeCloseTo(0.6011037519201636, 12);
    expect(createPrng(42).seed).toBe(42);
  });

  it('chance respects extremes', () => {
    const p = createPrng(7);
    expect(p.chance(0)).toBe(false);
    expect(p.chance(1)).toBe(true);
  });

  it('pick picks members and rejects empty lists', () => {
    const p = createPrng(3);
    expect(['a', 'b', 'c']).toContain(p.pick(['a', 'b', 'c']));
    expect(() => p.pick([])).toThrow('empty');
  });

  it('fork is independent of consumption order', () => {
    const a = createPrng(9);
    const b = createPrng(9);
    b.next();
    b.next();
    expect(a.fork('x').next()).toBe(b.fork('x').next());
    expect(a.fork('x').next()).not.toBe(a.fork('y').next());
  });

  it('hashString is stable', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('figura')).toBe(hashString('figura'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('newSeed maps a random source into 31 bits', () => {
    expect(newSeed(() => 0)).toBe(0);
    expect(newSeed(() => 0.5)).toBe(2 ** 30);
  });
});
