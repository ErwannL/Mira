/** Seeded pseudo-random generator (mulberry32). No Math.random anywhere in decision code. */
export interface Prng {
  readonly seed: number;
  next(): number;
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Independent stream derived from the seed and a label — insensitive to consumption order. */
  fork(label: string): Prng;
}

/** FNV-1a 32-bit hash. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: seed >>> 0,
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() on empty list');
      return items[Math.floor(next() * items.length)] as never;
    },
    fork: (label) => createPrng(hashString(`${seed >>> 0}:${label}`)),
  };
}

/** A fresh seed for a new run (the only non-deterministic input, stored on the run). */
export function newSeed(random: () => number): number {
  return Math.floor(random() * 2 ** 31);
}
