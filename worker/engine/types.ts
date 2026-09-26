import type { Facts } from '../../shared/facts.js';
import type { Persona } from '../../shared/persona-schema.js';
import type { Plan } from '../../shared/plans.js';
import type { UseCase } from '../../shared/catalogue-schema.js';
import type { Action } from '../friction/decide.js';
import type { Reason } from '../friction/friction.js';
import type { MoneyEncounter, MoneyOutcome } from '../friction/money.js';

export type Mistake = 'typoEmail' | 'weakPassword' | 'forgetTerms';

export interface ApiCall {
  method: string;
  /** Path template (catalogue form) — never the concrete URL with ids or tokens. */
  path: string;
  status: number;
  ms: number;
}

export interface Paywall {
  code: string;
  featureKey: string;
}

export interface StepOutcome {
  ok: boolean;
  facts: Facts;
  error: string | null;
  paywall: Paywall | null;
  screenshot: string | null;
  apiCalls: ApiCall[];
  wallMs: number;
  /** HTTP status of the last page load of the step (browser only; null otherwise). */
  navigationStatus: number | null;
  /**
   * The target never answered (navigation timeout, connection refused, DNS): an infrastructure
   * error, not something the persona experienced of the product.
   */
  unreachable: boolean;
  /** Context variables captured by the step (ids…), merged into persona memory. */
  captured: Record<string, string>;
  /** Pages (paths) visited during the step. */
  pages: string[];
}

export interface AttemptContext {
  persona: Persona;
  vars: Record<string, string>;
  mistakes: Mistake[];
  label: string;
}

export interface Driver {
  attempt(useCase: UseCase, ctx: AttemptContext): Promise<StepOutcome>;
  close(): Promise<void>;
}

export interface Credentials {
  email: string;
  password: string;
}

export type Stage = 'new' | 'active' | 'abandoned' | 'churned' | 'done';

export interface Memory {
  personaId: string;
  stage: Stage;
  sessions: number;
  frustration: number;
  succeeded: string[];
  attempted: string[];
  skipped: string[];
  learned: string[];
  pagesSeen: string[];
  errorsMet: { useCase: string; code: string }[];
  frustrationHistory: { sim: string; value: number }[];
  money: { sim: string; encounter: MoneyEncounter; outcome: MoneyOutcome }[];
  vars: Record<string, string>;
  plan: string;
}

export interface JourneyEvent {
  kind: 'step' | 'session' | 'life-end';
  personaId: string;
  session: number;
  simTime: string;
  wallTime: string;
  useCaseId: string | null;
  attempt: number;
  ok: boolean;
  wallMs: number;
  facts: Facts | null;
  friction: { score: number; reasons: Reason[] } | null;
  frustration: number;
  action: Action | null;
  rule: string;
  mistakes: Mistake[];
  screenshot: string | null;
  apiCalls: ApiCall[];
  money: MoneyOutcome | null;
  error: string | null;
}

export interface TargetPort {
  requestVerifyUrl(email: string): Promise<string>;
  plans(): Promise<Plan[]>;
}

export interface Recorder {
  event(e: JourneyEvent): Promise<void>;
}

export interface MemoryStore {
  load(personaId: string): Promise<{ memory: Memory; credentials: Credentials | null } | null>;
  save(memory: Memory, credentials: Credentials | null): Promise<void>;
}
