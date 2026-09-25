import type { Catalogue } from '../shared/catalogue-schema.js';
import { loadCommonUi, type CommonUi } from '../shared/common-ui.js';
import { checkPersonasAgainstCatalogue, loadCatalogue, loadPersonas, loadTimeConfig } from '../shared/loaders.js';
import { dataPaths } from '../shared/paths.js';
import type { Persona, TimeConfig } from '../shared/persona-schema.js';
import { loadWeights, type FrictionWeights } from '../shared/weights.js';

/** Versioned data files: personas, catalogue, weights, time config, common UI names. */
export interface SimData {
  personas: Persona[];
  catalogue: Catalogue;
  weights: FrictionWeights;
  time: TimeConfig;
  commonUi: CommonUi;
}

export function loadSimData(root: string): SimData {
  const p = dataPaths(root);
  const personas = loadPersonas(p.personas);
  const catalogue = loadCatalogue(p.catalogue);
  checkPersonasAgainstCatalogue(personas, catalogue);
  return { personas, catalogue, weights: loadWeights(p.weights), time: loadTimeConfig(p.time), commonUi: loadCommonUi(p.ui) };
}
