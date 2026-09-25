/** Facts a driver measures for one step. The friction model only ever sees these. */
export interface Facts {
  visibleFields: number;
  requiredFields: number;
  visibleWords: number;
  clicksToGoal: number;
  timeToInteractiveMs: number;
  networkErrors: number;
  validationErrors: number;
  unclearErrors: number;
  unnamedControls: number;
  captcha: boolean;
  cookieBanner: boolean;
  termsCheckbox: boolean;
  paywall: boolean;
  horizontalOverflow: boolean;
  foreignText: boolean;
  /** A control this step needs could only be found without its accessible name. */
  targetUnnamed: boolean;
}

export function emptyFacts(overrides: Partial<Facts> = {}): Facts {
  return {
    visibleFields: 0,
    requiredFields: 0,
    visibleWords: 0,
    clicksToGoal: 0,
    timeToInteractiveMs: 0,
    networkErrors: 0,
    validationErrors: 0,
    unclearErrors: 0,
    unnamedControls: 0,
    captcha: false,
    cookieBanner: false,
    termsCheckbox: false,
    paywall: false,
    horizontalOverflow: false,
    foreignText: false,
    targetUnnamed: false,
    ...overrides,
  };
}

/** Merges the facts of successive pages of one use case (counts add up, flags OR, sizes max). */
export function mergeFacts(a: Facts, b: Facts): Facts {
  return {
    visibleFields: Math.max(a.visibleFields, b.visibleFields),
    requiredFields: Math.max(a.requiredFields, b.requiredFields),
    visibleWords: Math.max(a.visibleWords, b.visibleWords),
    clicksToGoal: a.clicksToGoal + b.clicksToGoal,
    timeToInteractiveMs: Math.max(a.timeToInteractiveMs, b.timeToInteractiveMs),
    networkErrors: a.networkErrors + b.networkErrors,
    validationErrors: a.validationErrors + b.validationErrors,
    unclearErrors: a.unclearErrors + b.unclearErrors,
    unnamedControls: Math.max(a.unnamedControls, b.unnamedControls),
    captcha: a.captcha || b.captcha,
    cookieBanner: a.cookieBanner || b.cookieBanner,
    termsCheckbox: a.termsCheckbox || b.termsCheckbox,
    paywall: a.paywall || b.paywall,
    horizontalOverflow: a.horizontalOverflow || b.horizontalOverflow,
    foreignText: a.foreignText || b.foreignText,
    targetUnnamed: a.targetUnnamed || b.targetUnnamed,
  };
}
