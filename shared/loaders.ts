import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  personaSchema,
  timeConfigSchema,
  type Persona,
  type TimeConfig,
} from './persona-schema.js';
import { useCaseSchema, type Catalogue, type UseCase } from './catalogue-schema.js';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

/** Loads every persona file; weights are relative and normalised so they sum to 1. */
export function loadPersonas(dir: string): Persona[] {
  const personas = jsonFiles(dir).map((file) => {
    const parsed = personaSchema.safeParse(readJson(join(dir, file)));
    if (!parsed.success) throw new Error(`Invalid persona ${file}: ${parsed.error.message}`);
    if (`${parsed.data.id}.json` !== file)
      throw new Error(`Persona file ${file} must be named after its id`);
    return parsed.data;
  });
  if (personas.length === 0) throw new Error(`No persona in ${dir}`);
  const total = personas.reduce((s, p) => s + p.populationWeight, 0);
  if (total <= 0) throw new Error('populationWeight must not sum to 0');
  return personas.map((p) => ({ ...p, populationWeight: p.populationWeight / total }));
}

export function loadCatalogue(dir: string): Catalogue {
  const version = readFileSync(join(dir, 'VERSION'), 'utf8').trim();
  const useDir = join(dir, 'use-cases');
  const useCases = jsonFiles(useDir).map((file) => {
    const parsed = useCaseSchema.safeParse(readJson(join(useDir, file)));
    if (!parsed.success) throw new Error(`Invalid use case ${file}: ${parsed.error.message}`);
    if (`${parsed.data.id}.json` !== file)
      throw new Error(`Use case file ${file} must be named after its id`);
    return parsed.data;
  });
  const ids = new Set(useCases.map((u) => u.id));
  for (const u of useCases) {
    for (const r of u.requires) {
      if (!ids.has(r)) throw new Error(`Use case ${u.id} requires unknown ${r}`);
    }
  }
  const catalogue = { version, useCases };
  orderWithPrerequisites(catalogue, [...ids]);
  return catalogue;
}

export function checkPersonasAgainstCatalogue(personas: Persona[], catalogue: Catalogue): void {
  const ids = new Set(catalogue.useCases.map((u) => u.id));
  for (const p of personas) {
    for (const f of p.goalFeatures) {
      if (!ids.has(f)) throw new Error(`Persona ${p.id} has unknown goal feature ${f}`);
    }
  }
}

/** Topological order of the goals plus all their prerequisites (goals keep their relative order). */
export function orderWithPrerequisites(catalogue: Catalogue, goals: string[]): UseCase[] {
  const byId = new Map(catalogue.useCases.map((u) => [u.id, u]));
  const out: UseCase[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`Cycle in catalogue at ${id}`);
    const u = byId.get(id);
    if (!u) throw new Error(`Unknown use case ${id}`);
    visiting.add(id);
    u.requires.forEach(visit);
    visiting.delete(id);
    done.add(id);
    out.push(u);
  };
  goals.forEach(visit);
  return out;
}

export function loadTimeConfig(path: string): TimeConfig {
  return timeConfigSchema.parse(readJson(path));
}
