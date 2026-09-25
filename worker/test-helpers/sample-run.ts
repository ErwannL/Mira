import { emptyFacts } from '../../shared/facts.js';
import { catalogue, persona, timeConfig } from '../../shared/test-helpers/fixtures.js';
import { simulate } from '../engine/simulate.js';
import type { JourneyEvent, Memory } from '../engine/types.js';
import { buildMeta } from '../reports/meta.js';
import { journeyDeps, MemStore, ScriptedDriver } from './scripted.js';
import type { Persona } from '../../shared/persona-schema.js';

const chosen = ['retired-volunteer', 'project-manager', 'student'].map((id) => persona(id));
const total = chosen.reduce((s, p) => s + p.populationWeight, 0);
export const samplePersonas: Persona[] = chosen.map((p) => ({
  ...p,
  sessionsPerWeek: 40,
  populationWeight: p.populationWeight / total,
}));

/**
 * A deterministic run with scripted facts: the volunteer meets a 6-field signup, the student hits
 * the QR paywall, API calls carry fixed latencies. Used by report tests and the golden file.
 */
export async function sampleRun(
  extraFields = 6,
): Promise<{ events: JourneyEvent[]; memories: Memory[] }> {
  let n = 0;
  const driver = new ScriptedDriver((uc) => {
    n += 1;
    const apiCalls = uc.api.map((s) => ({
      method: s.method,
      path: s.path,
      status: s.expectStatus?.[0] ?? 200,
      ms: 10 + (n % 7),
    }));
    if (uc.id === 'signup')
      return {
        facts: emptyFacts({
          visibleFields: extraFields,
          requiredFields: extraFields,
          termsCheckbox: true,
        }),
        apiCalls,
        screenshot: `shot-${n}.jpg`,
      };
    if (uc.planGate !== 'free')
      return {
        ok: false,
        paywall: { code: 'FEATURE_LOCKED', featureKey: uc.planGate },
        facts: emptyFacts({ paywall: true }),
        apiCalls: [],
        screenshot: `shot-${n}.jpg`,
      };
    return { apiCalls, pages: [`/${uc.id}`] };
  });
  const store = new MemStore();
  const { deps, events } = journeyDeps(driver);
  await simulate(
    {
      seed: 2024,
      personas: samplePersonas,
      start: new Date('2030-01-07T00:00:00Z'),
      totalSimulatedDays: 3,
      minutesPerRound: 60,
      timeConfig,
    },
    {
      ...deps,
      memoryStore: store,
      newCredentials: (p) => ({ email: `synth+s-${p.id}@synthetic.invalid`, password: 'x' }),
      initialVars: () => ({ boardName: 'B', cardTitle: 'C' }),
    },
  );
  return { events, memories: [...store.data.values()].map((v) => v.memory) };
}

export const sampleMeta = buildMeta(
  {
    runId: 'sample',
    kind: 'journey',
    seed: 2024,
    catalogueVersion: catalogue.version,
    weightsVersion: 'fw-test',
    targetVersion: 'fake',
    targetUrl: 'http://localhost:4100',
    simulatedDays: 3,
    durationMs: 1234,
  },
  samplePersonas,
);
