import type { Browser } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomPassword } from '../shared/crypto.js';
import type { Persona } from '../shared/persona-schema.js';
import type { EffectiveTarget } from '../shared/targets.js';
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

/**
 * Orqea usernames: 3-30 of `[A-Za-z0-9_-]` (`routes/api/auth.js`). Without one, Orqea derives it
 * from the email's local part, and `synth+…` is refused for its `+`. Not unique in Orqea.
 */
export function syntheticUsername(runId: string, personaId: string): string {
  return `s${runId}_${personaId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 30);
}

export function initialVars(runId: string) {
  return (p: Persona): Record<string, string> => ({
    username: syntheticUsername(runId, p.id),
    boardName: p.locale === 'fr' ? `Tableau ${p.id}` : `Board ${p.id}`,
    cardTitle: p.locale === 'fr' ? 'Première tâche' : 'First task',
    inviteEmail: `synth+${runId}-guest@synthetic.invalid`,
    // Someone with no Orqea account (the "invite without account" path).
    strangerEmail: `synth+${runId}-stranger-${p.id}@synthetic.invalid`,
  });
}

export interface DriverSetup {
  openDriver: SimulationDeps['openDriver'];
  close: () => Promise<void>;
}

export async function browserDrivers(
  target: EffectiveTarget,
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
        baseUrl: target.browserBase,
        apiOrigin: new URL(target.api).origin,
        rewrite: target.rewrite,
        runHeader: opts.runHeader,
        screenshotDir: dir,
        stepTimeoutMs: opts.stepTimeoutMs,
        commonUi: data.commonUi,
      }),
    close: () => browser.close(),
  };
}

export function apiDrivers(
  target: EffectiveTarget,
  opts: { runHeader: () => string; fetchImpl: typeof fetch; requestsPerSecond: number },
): DriverSetup {
  const limiter = new RateLimiter(opts.requestsPerSecond);
  const make = async (): Promise<Driver> =>
    new ApiDriver({
      baseUrl: target.api.replace(/\/$/, ''),
      runHeader: opts.runHeader,
      fetchImpl: opts.fetchImpl,
      now: Date.now,
      limiter,
    });
  return { openDriver: make, close: async () => {} };
}
