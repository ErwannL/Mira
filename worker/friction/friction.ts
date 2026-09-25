import type { Facts } from '../../shared/facts.js';
import type { Persona } from '../../shared/persona-schema.js';
import type { FrictionWeights } from '../../shared/weights.js';

export interface Reason {
  code: string;
  value: number;
}

export interface FrictionResult {
  score: number;
  reasons: Reason[];
  /** A hard block ends the journey regardless of frustration (e.g. screen reader + unnamed control). */
  hardBlock: string | null;
}

export interface FrictionContext {
  /** Expected clicks/fields for this use case (catalogue frictionHints). */
  expectedClicks: number;
  /** The persona already learned where this feature lives. */
  learned: boolean;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const flag = (b: boolean): number => (b ? 1 : 0);

type Rule = (f: Facts, p: Persona, w: FrictionWeights, c: FrictionContext) => number;

/** Each rule: fact × weight × trait modulation. Order is the reporting order on ties. */
export const RULES: Record<string, Rule> = {
  'too-many-fields': (f, p, w) =>
    Math.max(0, f.visibleFields - w.freeFields) * w.perExtraField * (1.5 - p.techSavvy),
  'required-fields': (f, _p, w) => f.requiredFields * w.perRequiredField,
  'too-much-text': (f, p, w) => {
    const budget = w.wordsBudgetBase + w.wordsBudgetScale * p.readingTolerance;
    return clamp01(Math.max(0, f.visibleWords - budget) / w.wordsScale) * w.words;
  },
  'too-many-clicks': (f, p, w, c) =>
    Math.max(0, f.clicksToGoal - c.expectedClicks) * w.perExtraClick * (1.2 - p.patience),
  'slow-page': (f, p, w) =>
    clamp01(Math.max(0, f.timeToInteractiveMs - w.ttiFreeMs) / w.ttiScaleMs) * w.tti * (1.2 - p.patience),
  'network-error': (f, _p, w) => f.networkErrors * w.networkError,
  'validation-error': (f, p, w) => f.validationErrors * w.validationError * (1 - 0.5 * p.recoveryWillingness),
  'unclear-error': (f, p, w) => f.unclearErrors * w.unclearError * (1.2 - p.techSavvy),
  'unnamed-control': (f, p, w) =>
    f.unnamedControls * w.unnamedControl * (p.assistive?.screenReader ? 3 : 1),
  captcha: (f, p, w) => flag(f.captcha) * w.captcha * (1.2 - p.patience),
  'cookie-banner': (f, p, w) => flag(f.cookieBanner) * w.cookieBanner * (0.5 + p.privacyConcern),
  'terms-checkbox': (f, p, w) => flag(f.termsCheckbox) * w.termsCheckbox * p.privacyConcern,
  paywall: (f, _p, w) => flag(f.paywall) * w.paywall,
  'horizontal-overflow': (f, p, w) =>
    flag(f.horizontalOverflow) * (p.device === 'mobile' ? w.overflowMobile : w.overflowOther),
  'foreign-language': (f, p, w) => flag(f.foreignText) * w.foreignText * (1.2 - p.techSavvy),
};

export function frictionOf(
  facts: Facts,
  persona: Persona,
  weights: FrictionWeights,
  ctx: FrictionContext,
): FrictionResult {
  const reasons: Reason[] = [];
  let sum = 0;
  for (const [code, rule] of Object.entries(RULES)) {
    const value = rule(facts, persona, weights, ctx);
    if (value > 0) {
      reasons.push({ code, value: round(value) });
      sum += value;
    }
  }
  reasons.sort((a, b) => b.value - a.value);
  const factor = ctx.learned ? weights.learnedFactor : 1;
  const hardBlock =
    persona.assistive?.screenReader && facts.targetUnnamed ? 'control-without-accessible-name' : null;
  return { score: round(clamp01(sum * factor)), reasons, hardBlock };
}

export function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** Frustration accumulates with decay; never negative. */
export function accumulate(frustration: number, score: number, weights: FrictionWeights): number {
  return round(Math.max(0, frustration * weights.decayPerStep + score));
}

export function relieve(frustration: number, weights: FrictionWeights): number {
  return round(Math.max(0, frustration - weights.successRelief));
}

export function betweenSessions(frustration: number, weights: FrictionWeights): number {
  return round(frustration * weights.decayPerSession);
}

export function toleranceOf(persona: Persona, weights: FrictionWeights): number {
  return round(weights.toleranceBase + weights.toleranceScale * persona.frictionTolerance);
}
