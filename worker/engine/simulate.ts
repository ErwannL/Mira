import type { Persona, TimeConfig } from '../../shared/persona-schema.js';
import { createPrng } from '../../shared/prng.js';
import { isFinal, newMemory, runSession, type JourneyDeps, type Life } from './journey.js';
import { isActive, roundTimes } from './scheduler.js';
import type { Credentials, MemoryStore } from './types.js';

export interface SimulationPlan {
  seed: number;
  personas: Persona[];
  start: Date;
  totalSimulatedDays: number;
  minutesPerRound: number;
  timeConfig: TimeConfig;
}

export interface SimulationDeps extends JourneyDeps {
  memoryStore: MemoryStore;
  newCredentials: (persona: Persona) => Credentials;
  initialVars: (persona: Persona) => Record<string, string>;
}

export interface SimulationSummary {
  rounds: number;
  sessions: number;
  stages: Record<string, string>;
  stopped: boolean;
}

async function loadLife(persona: Persona, seed: number, deps: SimulationDeps): Promise<Life> {
  const prng = createPrng(seed).fork(persona.id);
  const stored = await deps.memoryStore.load(persona.id);
  if (stored?.credentials)
    return { persona, prng, memory: stored.memory, credentials: stored.credentials };
  const credentials = deps.newCredentials(persona);
  const memory = newMemory(persona, deps.initialVars(persona));
  await deps.memoryStore.save(memory, credentials);
  return { persona, prng, memory, credentials };
}

/** Runs rounds of simulated time; each active persona lives one real browser/API session. */
export async function simulate(
  plan: SimulationPlan,
  deps: SimulationDeps,
): Promise<SimulationSummary> {
  const lives: Life[] = [];
  for (const p of plan.personas) lives.push(await loadLife(p, plan.seed, deps));
  const times = roundTimes(plan.start, plan.totalSimulatedDays, plan.minutesPerRound);
  let rounds = 0;
  let sessions = 0;
  for (const [i, at] of times.entries()) {
    if (deps.shouldStop() || lives.every((l) => isFinal(l.memory))) break;
    rounds += 1;
    for (const life of lives) {
      if (isFinal(life.memory) || deps.shouldStop()) continue;
      const check = isActive(
        life.persona,
        at,
        plan.minutesPerRound,
        plan.timeConfig,
        life.prng.fork(`round-${i}`),
      );
      if (!check.active) continue;
      sessions += 1;
      await runSession(life, at, deps);
      await deps.memoryStore.save(life.memory, life.credentials);
    }
  }
  return {
    rounds,
    sessions,
    stages: Object.fromEntries(lives.map((l) => [l.persona.id, l.memory.stage])),
    stopped: deps.shouldStop(),
  };
}
