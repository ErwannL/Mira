import { emptyFacts, type Facts } from '../../shared/facts.js';
import type { UseCase } from '../../shared/catalogue-schema.js';
import type { Plan } from '../../shared/plans.js';
import type {
  AttemptContext,
  Driver,
  JourneyEvent,
  Memory,
  MemoryStore,
  Credentials,
  StepOutcome,
} from '../engine/types.js';
import type { JourneyDeps } from '../engine/journey.js';
import { catalogue, weights } from '../../shared/test-helpers/fixtures.js';

export type Script = (uc: UseCase, ctx: AttemptContext) => Partial<StepOutcome> & { facts?: Facts };

export function outcome(partial: Partial<StepOutcome> = {}): StepOutcome {
  return {
    ok: true,
    facts: emptyFacts(),
    error: null,
    paywall: null,
    screenshot: null,
    apiCalls: [],
    wallMs: 5,
    navigationStatus: null,
    unreachable: false,
    captured: {},
    pages: [],
    ...partial,
  };
}

export class ScriptedDriver implements Driver {
  calls: { id: string; ctx: AttemptContext }[] = [];
  closed = 0;
  constructor(private script: Script = () => ({})) {}
  async attempt(uc: UseCase, ctx: AttemptContext): Promise<StepOutcome> {
    this.calls.push({ id: uc.id, ctx });
    return outcome(this.script(uc, ctx));
  }
  async close(): Promise<void> {
    this.closed += 1;
  }
}

export const testPlans: Plan[] = [
  { key: 'free', name: 'Free', priceMonthly: 0, currency: 'EUR', perSeat: false, features: [] },
  {
    key: 'pro',
    name: 'Pro',
    priceMonthly: 9,
    currency: 'EUR',
    perSeat: false,
    features: ['aiAgents', 'integrations', 'advancedAnalytics', 'qrCodes'],
  },
];

export class MemStore implements MemoryStore {
  data = new Map<string, { memory: Memory; credentials: Credentials | null }>();
  async load(id: string) {
    const v = this.data.get(id);
    return v ? structuredClone(v) : null;
  }
  async save(memory: Memory, credentials: Credentials | null) {
    this.data.set(memory.personaId, structuredClone({ memory, credentials }));
  }
}

export function journeyDeps(driver: Driver, overrides: Partial<JourneyDeps> = {}) {
  const events: JourneyEvent[] = [];
  const deps: JourneyDeps = {
    catalogue,
    weights,
    target: {
      requestVerifyUrl: async (email) => `http://t/verify?token=tok-${encodeURIComponent(email)}`,
      plans: async () => testPlans,
    },
    recorder: { event: async (e) => void events.push(e) },
    openDriver: async () => driver,
    shouldStop: () => false,
    now: () => new Date('2030-01-01T00:00:00Z'),
    allowCheckout: false,
    ...overrides,
  };
  return { deps, events };
}
