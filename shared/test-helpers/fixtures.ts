import { loadCatalogue, loadPersonas, loadTimeConfig } from '../loaders.js';
import { dataPaths, repoRoot } from '../paths.js';
import { loadWeights } from '../weights.js';
import type { Persona } from '../persona-schema.js';

export const paths = dataPaths(repoRoot());
export const personas = loadPersonas(paths.personas);
export const catalogue = loadCatalogue(paths.catalogue);
export const weights = loadWeights(paths.weights);
export const timeConfig = loadTimeConfig(paths.time);

export function persona(id: string): Persona {
  const p = personas.find((x) => x.id === id);
  if (!p) throw new Error(`no persona ${id}`);
  return p;
}
