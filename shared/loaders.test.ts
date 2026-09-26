import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkPersonasAgainstCatalogue,
  loadCatalogue,
  loadPersonas,
  orderWithPrerequisites,
} from './loaders.js';
import { catalogue, personas } from './test-helpers/fixtures.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'figura-'));
const base = personas[0]!;

describe('loadPersonas', () => {
  it('loads the ten shipped personas with weights summing to 1', () => {
    expect(personas).toHaveLength(10);
    expect(personas.reduce((s, p) => s + p.populationWeight, 0)).toBeCloseTo(1, 10);
  });
  it('normalises relative weights (persona #11 needs no edit elsewhere)', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ ...base, id: 'a', populationWeight: 0.2 }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ ...base, id: 'b', populationWeight: 0.6 }));
    writeFileSync(join(dir, 'notes.txt'), 'ignored');
    const loaded = loadPersonas(dir);
    expect(loaded[0]!.populationWeight).toBeCloseTo(0.25, 10);
    expect(loaded[1]!.populationWeight).toBeCloseTo(0.75, 10);
  });
  it('rejects invalid, misnamed, empty and zero-weight sets', () => {
    const bad = tmp();
    writeFileSync(join(bad, 'x.json'), JSON.stringify({ ...base, id: 'x', patience: 2 }));
    expect(() => loadPersonas(bad)).toThrow('Invalid persona x.json');
    const misnamed = tmp();
    writeFileSync(join(misnamed, 'y.json'), JSON.stringify({ ...base, id: 'z' }));
    expect(() => loadPersonas(misnamed)).toThrow('must be named after its id');
    expect(() => loadPersonas(tmp())).toThrow('No persona');
    const zero = tmp();
    writeFileSync(join(zero, 'w.json'), JSON.stringify({ ...base, id: 'w', populationWeight: 0 }));
    expect(() => loadPersonas(zero)).toThrow('sum to 0');
  });
});

function writeCatalogue(useCases: object[]): string {
  const dir = tmp();
  mkdirSync(join(dir, 'use-cases'));
  writeFileSync(join(dir, 'VERSION'), 'v-test\n');
  for (const u of useCases) {
    writeFileSync(join(dir, 'use-cases', `${(u as { id: string }).id}.json`), JSON.stringify(u));
  }
  return dir;
}
const landing = catalogue.useCases.find((u) => u.id === 'landing')!;

describe('loadCatalogue', () => {
  it('loads the 31 use cases with a version', () => {
    expect(catalogue.version).toMatch(/^cat-/);
    expect(catalogue.useCases).toHaveLength(31);
  });
  it('rejects invalid files, bad names, unknown requirements and cycles', () => {
    expect(() => loadCatalogue(writeCatalogue([{ ...landing, minutes: -1 }]))).toThrow(
      'Invalid use case',
    );
    const misnamed = writeCatalogue([]);
    writeFileSync(join(misnamed, 'use-cases', 'other.json'), JSON.stringify(landing));
    expect(() => loadCatalogue(misnamed)).toThrow('must be named after its id');
    expect(() => loadCatalogue(writeCatalogue([{ ...landing, requires: ['ghost'] }]))).toThrow(
      'requires unknown ghost',
    );
    const cyc = writeCatalogue([
      { ...landing, id: 'a', requires: ['b'] },
      { ...landing, id: 'b', requires: ['a'] },
    ]);
    expect(() => loadCatalogue(cyc)).toThrow('Cycle');
  });
});

describe('orderWithPrerequisites', () => {
  it('orders prerequisites first, once each', () => {
    const ids = orderWithPrerequisites(catalogue, ['create-card', 'create-list']).map((u) => u.id);
    expect(ids).toEqual([
      'landing',
      'signup',
      'verify-email',
      'login',
      'create-board',
      'create-card',
      'create-list',
    ]);
  });
  it('rejects unknown goals', () => {
    expect(() => orderWithPrerequisites(catalogue, ['nope'])).toThrow('Unknown use case nope');
  });
});

describe('checkPersonasAgainstCatalogue', () => {
  it('accepts the shipped set and rejects unknown goals', () => {
    expect(() => checkPersonasAgainstCatalogue(personas, catalogue)).not.toThrow();
    expect(() =>
      checkPersonasAgainstCatalogue([{ ...base, goalFeatures: ['zzz'] }], catalogue),
    ).toThrow('unknown goal feature zzz');
  });
});
