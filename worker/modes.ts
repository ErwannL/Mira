import type { Browser } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomPassword } from '../shared/crypto.js';
import type { Persona } from '../shared/persona-schema.js';
import type { RunConfig } from '../shared/run-config.js';
import { syntheticEmail } from '../shared/synthetic.js';
import { ApiDriver } from './drivers/api-driver.js';
import { BrowserDriver } from './drivers/browser-driver.js';
import { RateLimiter } from './drivers/limiter.js';
import type { SimulationDeps } from './engine/simulate.js';
import type { Driver } from './engine/types.js';
import type { SimData } from './data.js';

/** Volume mode: N cloned accounts per persona = populationWeight × targetUsers (≥ 1). */
export function clonesOf(personas: Persona[], targetUsers: number): Persona[] {
  return personas.flatMap((p) => {
    const n = Math.max(1, Math.round(p.populationWeight * targetUsers));
    return Array.from({ length: n }, (_, i) => ({
      ...p,
      id: `${p.id}-c${i + 1}`,
      populationWeight: p.populationWeight / n,
    }));
  });
}

/** The run's personas, weights renormalised so the selection models the whole population. */
export function selectPersonas(all: Persona[], ids: string[]): Persona[] {
  const unknown = ids.filter((id) => !all.some((p) => p.id === id));
  if (unknown.length) throw new Error(`Unknown personas: ${unknown.join(', ')}`);
  const chosen = ids.length === 0 ? all : all.filter((p) => ids.includes(p.id));
  const total = chosen.reduce((s, p) => s + p.populationWeight, 0);
  return chosen.map((p) => ({ ...p, populationWeight: p.populationWeight / total }));
}

export function newCredentials(runId: string) {
  return (p: Persona) => {
    const clone = /^(.*)-c(\d+)$/.exec(p.id);
    const email = clone
      ? syntheticEmail(runId, clone[1] as string, Number(clone[2]))
      : syntheticEmail(runId, p.id);
    return { email, password: randomPassword() };
  };
}

export function initialVars(runId: string) {
  return (p: Persona): Record<string, string> => ({
    boardName: p.locale === 'fr' ? `Tableau ${p.id}` : `Board ${p.id}`,
    cardTitle: p.locale === 'fr' ? 'Première tâche' : 'First task',
    inviteEmail: `synth+${runId}-guest@synthetic.invalid`,
  });
}

export interface DriverSetup {
  openDriver: SimulationDeps['openDriver'];
  close: () => Promise<void>;
}

export async function browserDrivers(
  config: RunConfig,
  runId: string,
  data: SimData,
  opts: {
    launch: () => Promise<Browser>;
    runHeader: () => string;
    screenshotsDir: string;
    stepTimeoutMs: number;
  },
): Promise<DriverSetup> {
  const browser = await opts.launch();
  const dir = join(opts.screenshotsDir, runId);
  mkdirSync(dir, { recursive: true });
  return {
    openDriver: (persona) =>
      BrowserDriver.open(browser, persona, {
        baseUrl: config.targetUrl.replace(/\/$/, ''),
        runHeader: opts.runHeader,
        screenshotDir: dir,
        stepTimeoutMs: opts.stepTimeoutMs,
        commonUi: data.commonUi,
      }),
    close: () => browser.close(),
  };
}

export function apiDrivers(
  config: RunConfig,
  opts: { runHeader: () => string; fetchImpl: typeof fetch; requestsPerSecond: number },
): DriverSetup {
  const limiter = new RateLimiter(opts.requestsPerSecond);
  const make = async (): Promise<Driver> =>
    new ApiDriver({
      baseUrl: config.targetUrl.replace(/\/$/, ''),
      runHeader: opts.runHeader,
      fetchImpl: opts.fetchImpl,
      now: Date.now,
      limiter,
    });
  return { openDriver: make, close: async () => {} };
}
