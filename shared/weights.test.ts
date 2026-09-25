import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWeights } from './weights.js';
import { paths } from './test-helpers/fixtures.js';

describe('loadWeights', () => {
  it('loads the versioned weights', () => {
    expect(loadWeights(paths.weights).version).toMatch(/^fw-/);
  });
  it('rejects unknown keys', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'w-')), 'w.json');
    writeFileSync(f, JSON.stringify({ ...loadWeights(paths.weights), extra: 1 }));
    expect(() => loadWeights(f)).toThrow();
  });
});
