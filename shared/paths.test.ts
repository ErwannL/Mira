import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataPaths, repoRoot } from './paths.js';

describe('paths', () => {
  it('finds the repo root from sources and from dist', () => {
    // OS-neutral: the same assertions hold with POSIX and Windows paths.
    const root = resolve('/repo');
    const url = (...p: string[]) => pathToFileURL(join(root, ...p)).href;
    expect(repoRoot(url('shared', 'paths.ts'))).toBe(root);
    expect(repoRoot(url('dist', 'shared', 'paths.js'))).toBe(root);
    expect(repoRoot()).toBe(join(import.meta.dirname, '..'));
  });
  it('lists data paths', () => {
    expect(dataPaths('/r').weights).toBe(join('/r', 'config', 'friction-weights.json'));
  });
});
