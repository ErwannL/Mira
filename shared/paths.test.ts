import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { dataPaths, repoRoot } from './paths.js';

describe('paths', () => {
  it('finds the repo root from sources and from dist', () => {
    expect(repoRoot('file:///repo/shared/paths.ts')).toBe('/repo');
    expect(repoRoot('file:///repo/dist/shared/paths.js')).toBe('/repo');
    expect(repoRoot()).toBe(join(import.meta.dirname, '..'));
  });
  it('lists data paths', () => {
    expect(dataPaths('/r').weights).toBe('/r/config/friction-weights.json');
  });
});
