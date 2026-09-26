import type { Catalogue, UseCase } from '../../shared/catalogue-schema.js';
import type { Persona } from '../../shared/persona-schema.js';
import type { Prng } from '../../shared/prng.js';
import type { FrictionWeights } from '../../shared/weights.js';
import { decide, type Decision } from '../friction/decide.js';
import {
  accumulate,
  betweenSessions,
  frictionOf,
  relieve,
  type FrictionResult,
} from '../friction/friction.js';
import { decideMoney, type MoneyOutcome } from '../friction/money.js';
import { fixMistakes, pickMistakes } from './mistakes.js';
import { goalsReached, isCritical, lifeGoals, sessionPlan } from './planner.js';
import type {
  Credentials,
  Driver,
  JourneyEvent,
  Memory,
  Paywall,
  Recorder,
  StepOutcome,
  TargetPort,
} from './types.js';

export interface JourneyDeps {
  catalogue: Catalogue;
  weights: FrictionWeights;
  target: TargetPort;
  recorder: Recorder;
  openDriver: (persona: Persona) => Promise<Driver>;
  shouldStop: () => boolean;
  now: () => Date;
  allowCheckout: boolean;
}

export interface Life {
  persona: Persona;
  prng: Prng;
  memory: Memory;
  credentials: Credentials;
}

export function newMemory(persona: Persona, vars: Record<string, string>): Memory {
  return {
    personaId: persona.id,
    stage: 'new',
    sessions: 0,
    frustration: 0,
    succeeded: [],
    attempted: [],
    skipped: [],
    learned: [],
    pagesSeen: [],
    errorsMet: [],
    frustrationHistory: [],
    money: [],
    vars,
    plan: 'free',
  };
}

const addOnce = (list: string[], v: string): void => {
  if (!list.includes(v)) list.push(v);
};

export function neededFeatures(persona: Persona, catalogue: Catalogue): string[] {
  return catalogue.useCases
    .filter((u) => persona.goalFeatures.includes(u.id) && u.planGate !== 'free')
    .map((u) => u.planGate);
}

export function isFinal(memory: Memory): boolean {
  return memory.stage === 'abandoned' || memory.stage === 'churned' || memory.stage === 'done';
}

/** One session of a persona's life at simulated instant `sim`. Mutates and returns the memory. */
export async function runSession(life: Life, sim: Date, deps: JourneyDeps): Promise<Memory> {
  const { memory, persona } = life;
  if (isFinal(memory)) return memory;
  memory.sessions += 1;
  memory.stage = 'active';
  memory.frustration = betweenSessions(memory.frustration, deps.weights);
  const sessionPrng = life.prng.fork(`session-${memory.sessions}`);
  const goals = lifeGoals(persona, life.prng.fork('goals'));
  const plan = sessionPlan(memory, goals, persona, deps.catalogue, sessionPrng);
  await deps.recorder.event(
    baseEvent(
      life,
      sim,
      deps,
      'session',
      null,
      `session ${memory.sessions}: ${plan.map((u) => u.id).join(' → ')}`,
    ),
  );
  const driver = await deps.openDriver(persona);
  try {
    let budget = persona.sessionLengthMin;
    for (const useCase of plan) {
      if (budget <= 0 || deps.shouldStop() || isFinal(memory)) break;
      budget -= useCase.minutes;
      await attemptUseCase(life, useCase, sim, driver, deps, sessionPrng.fork(useCase.id));
    }
  } finally {
    await driver.close();
  }
  if (!isFinal(memory) && goalsReached(memory, goals)) {
    memory.stage = 'done';
    await deps.recorder.event(
      baseEvent(life, sim, deps, 'life-end', null, 'all goals reached or consciously skipped'),
    );
  }
  return memory;
}

function baseEvent(
  life: Life,
  sim: Date,
  deps: JourneyDeps,
  kind: JourneyEvent['kind'],
  useCaseId: string | null,
  rule: string,
): JourneyEvent {
  return {
    kind,
    personaId: life.persona.id,
    session: life.memory.sessions,
    simTime: sim.toISOString(),
    wallTime: deps.now().toISOString(),
    useCaseId,
    attempt: 0,
    ok: true,
    wallMs: 0,
    facts: null,
    friction: null,
    frustration: life.memory.frustration,
    action: null,
    rule,
    mistakes: [],
    screenshot: null,
    apiCalls: [],
    money: null,
    error: null,
  };
}

async function prepareVars(life: Life, useCase: UseCase, deps: JourneyDeps): Promise<void> {
  const vars = life.memory.vars;
  if (useCase.id === 'verify-email') {
    const url = await deps.target.requestVerifyUrl(life.credentials.email);
    vars.verifyUrl = url;
    vars.verifyToken = new URL(url).searchParams.get('token') ?? '';
  }
}

/** What a step may type: persona memory plus credentials (never persisted with the memory). */
function stepVars(life: Life): Record<string, string> {
  return {
    ...life.memory.vars,
    email: life.credentials.email,
    password: life.credentials.password,
    locale: life.persona.locale,
    personaName: life.persona.displayName,
  };
}

export function checkoutAllowed(life: Life, deps: JourneyDeps): string | null {
  const converted = life.memory.money.some((m) => m.outcome.decision === 'convert');
  if (!converted) return 'no conversion decision yet';
  if (!deps.allowCheckout)
    return 'conversion recorded only (test-mode checkout not enabled for this run)';
  return null;
}

async function attemptUseCase(
  life: Life,
  useCase: UseCase,
  sim: Date,
  driver: Driver,
  deps: JourneyDeps,
  prng: Prng,
): Promise<void> {
  const { memory, persona } = life;
  const missing = useCase.requires.find((r) => !memory.succeeded.includes(r));
  const blocked = missing
    ? `prerequisite ${missing} not met`
    : useCase.id === 'billing-checkout'
      ? checkoutAllowed(life, deps)
      : null;
  if (blocked) {
    if (!missing) addOnce(memory.skipped, useCase.id);
    await deps.recorder.event({
      ...baseEvent(life, sim, deps, 'step', useCase.id, `skipped: ${blocked}`),
      action: 'skip',
    });
    return;
  }
  addOnce(memory.attempted, useCase.id);
  let mistakes = pickMistakes(useCase, persona, prng);
  for (let attempt = 1; ; attempt++) {
    await prepareVars(life, useCase, deps);
    const vars = stepVars(life);
    const outcome = await driver.attempt(useCase, {
      persona,
      vars,
      mistakes,
      label: `${persona.id}-s${memory.sessions}-${useCase.id}-${attempt}`,
    });
    // The target did not answer: not the persona's experience. The run fails as an
    // infrastructure error; no friction, no decision is recorded from it.
    if (outcome.unreachable) throw new Error(`TARGET_UNREACHABLE: ${useCase.id}: ${outcome.error}`);
    Object.assign(memory.vars, outcome.captured);
    outcome.pages.forEach((p) => addOnce(memory.pagesSeen, p));
    const friction = frictionOf(outcome.facts, persona, deps.weights, {
      expectedClicks: useCase.frictionHints.clicks,
      learned: memory.learned.includes(useCase.id),
    });
    memory.frustration = accumulate(memory.frustration, friction.score, deps.weights);
    memory.frustrationHistory.push({ sim: sim.toISOString(), value: memory.frustration });
    if (!outcome.ok)
      memory.errorsMet.push({ useCase: useCase.id, code: outcome.error ?? 'failed' });
    const { decision, money } = await decideStep(
      life,
      useCase,
      outcome,
      friction,
      attempt,
      sim,
      deps,
      prng,
    );
    await deps.recorder.event({
      ...baseEvent(life, sim, deps, 'step', useCase.id, decision.rule),
      attempt,
      ok: outcome.ok,
      wallMs: outcome.wallMs,
      facts: outcome.facts,
      friction: { score: friction.score, reasons: friction.reasons },
      action: decision.action,
      mistakes,
      screenshot: outcome.screenshot,
      apiCalls: outcome.apiCalls,
      money,
      error: outcome.error,
    });
    if (decision.action !== 'retry') {
      applyDecision(life, useCase, decision, money, deps);
      return;
    }
    mistakes = fixMistakes(mistakes, outcome.facts.unclearErrors > 0, persona, prng);
  }
}

async function decideStep(
  life: Life,
  useCase: UseCase,
  outcome: StepOutcome,
  friction: FrictionResult,
  attempts: number,
  sim: Date,
  deps: JourneyDeps,
  prng: Prng,
): Promise<{ decision: Decision; money: MoneyOutcome | null }> {
  const { memory, persona } = life;
  const input = {
    frustration: memory.frustration,
    friction,
    attempts,
    critical: isCritical(useCase),
  };
  const isPricingPage = useCase.id === 'billing-view-plans' && outcome.ok;
  if (!outcome.paywall && !isPricingPage) {
    return {
      decision: decide({ ...input, stepFailed: !outcome.ok }, persona, deps.weights, prng),
      money: null,
    };
  }
  const encounter = {
    featureKey: outcome.paywall?.featureKey ?? null,
    neededFeatures: neededFeatures(persona, deps.catalogue),
    // attempted always contains the current use case here, so the ratio is defined.
    satisfaction: memory.succeeded.length / memory.attempted.length,
  };
  const money = decideMoney(encounter, await deps.target.plans(), persona);
  memory.money.push({ sim: sim.toISOString(), encounter, outcome: money });
  if (money.decision === 'convert') {
    memory.vars.planKey = money.planKey as string;
    memory.vars.planName =
      memory.vars.planKey.charAt(0).toUpperCase() + memory.vars.planKey.slice(1);
  }
  if (money.decision === 'churn')
    return { decision: { action: 'abandon', rule: `paywall churn: ${money.rule}` }, money };
  const d = decide({ ...input, stepFailed: false }, persona, deps.weights, prng);
  if (d.action === 'abandon' || isPricingPage) return { decision: d, money };
  return {
    decision: {
      action: 'skip',
      rule: `paywall ${(outcome.paywall as Paywall).code}: ${money.rule}`,
    },
    money,
  };
}

function applyDecision(
  life: Life,
  useCase: UseCase,
  decision: Decision,
  money: MoneyOutcome | null,
  deps: JourneyDeps,
): void {
  const { memory } = life;
  if (decision.action === 'continue') {
    addOnce(memory.succeeded, useCase.id);
    addOnce(memory.learned, useCase.id);
    memory.frustration = relieve(memory.frustration, deps.weights);
  } else if (decision.action === 'skip') {
    addOnce(memory.skipped, useCase.id);
  } else {
    memory.stage = money?.decision === 'churn' ? 'churned' : 'abandoned';
  }
}
