import type { Persona } from '../../shared/persona-schema.js';

export const DISCLAIMER = (n: number): string => `Simulation of ${n} modelled personas, not a measurement of real users.`;

export interface ReportMeta {
  runId: string;
  kind: string;
  seed: number;
  catalogueVersion: string;
  weightsVersion: string;
  targetVersion: string;
  targetUrl: string;
  personas: { id: string; displayName: string; weight: number }[];
  simulatedDays: number;
  /** Real wall-clock duration: timing noise is recorded, never hidden. */
  durationMs: number;
  disclaimer: string;
}

export function buildMeta(input: Omit<ReportMeta, 'personas' | 'disclaimer'>, personas: Persona[]): ReportMeta {
  return {
    ...input,
    personas: personas.map((p) => ({ id: p.id, displayName: p.displayName, weight: p.populationWeight })),
    disclaimer: DISCLAIMER(personas.length),
  };
}
