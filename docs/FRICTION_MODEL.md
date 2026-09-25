# Friction model

All weights live in `config/friction-weights.json` (versioned, stamped on each run and report).
No AI: facts × weights × traits, plus a seeded PRNG for the few probabilistic choices.

## 1. Facts (measured by the driver per use case)

`visibleFields`, `requiredFields`, `visibleWords` (visible letters-only words), `clicksToGoal`,
`timeToInteractiveMs`, `networkErrors` (≥ 500, failed requests), `validationErrors` (visible
`role=alert`), `unclearErrors` (alerts shorter than 15 chars or generic), `unnamedControls`,
`captcha` (checkbox "robot/captcha", captcha iframe, or `X-Captcha-Would-Show: 1`), `cookieBanner`,
`termsCheckbox`, `paywall` (402), `horizontalOverflow`, `foreignText` (page reads as the other
language, or a control was found only by its other-language name), `targetUnnamed`.

## 2. `frictionOf(facts, persona) → {score ∈ [0,1], reasons[], hardBlock}`

| Reason              | Contribution                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------- |
| too-many-fields     | max(0, fields − freeFields) × perExtraField × (1.5 − techSavvy)                               |
| required-fields     | required × perRequiredField                                                                   |
| too-much-text       | clamp((words − (wordsBudgetBase + wordsBudgetScale × readingTolerance)) / wordsScale) × words |
| too-many-clicks     | max(0, clicks − expected) × perExtraClick × (1.2 − patience)                                  |
| slow-page           | clamp((tti − ttiFreeMs) / ttiScaleMs) × tti × (1.2 − patience)                                |
| network-error       | n × networkError                                                                              |
| validation-error    | n × validationError × (1 − 0.5 × recoveryWillingness)                                         |
| unclear-error       | n × unclearError × (1.2 − techSavvy)                                                          |
| unnamed-control     | n × unnamedControl × (3 for screen-reader users, else 1)                                      |
| captcha             | captcha × (1.2 − patience)                                                                    |
| cookie-banner       | cookieBanner × (0.5 + privacyConcern)                                                         |
| terms-checkbox      | termsCheckbox × privacyConcern                                                                |
| paywall             | paywall                                                                                       |
| horizontal-overflow | overflowMobile on mobile, overflowOther otherwise                                             |
| foreign-language    | foreignText × (1.2 − techSavvy)                                                               |

`score = clamp(Σ) × (learnedFactor if the persona already knows this feature, else 1)`.
Hard block: screen-reader persona + a needed control without accessible name.

## 3. Frustration

`f ← f × decayPerStep + score` after each attempt; `f ← f − successRelief` after a success;
`f ← f × decayPerSession` at the start of each session. Never negative (property-tested).

## 4. `decide(frustration, persona, prng)`

1. hard block ⇒ **abandon**; 2. `f ≥ toleranceBase + toleranceScale × frictionTolerance` ⇒ **abandon**;
2. step succeeded ⇒ **continue**; 4. failed and attempts ≤ maxRetries: roll < `recoveryWillingness × (1 − f/tolerance)` ⇒ **retry**,
   else **abandon** on a critical (acquisition) step / **skip** otherwise; 5. out of retries ⇒ abandon/skip likewise.
   The exact rule string (with numbers) is stored with every event and shown in the inspector.

## 5. Money (`worker/friction/money.ts`)

On a 402 or the pricing page: candidate = cheapest paid plan that unlocks the feature (per-seat
plans × teamSize); `need = 1` if a goal needs it else `0.3`;
`perceivedValue = need × (0.5 + 0.3 × satisfaction + 0.2 × urgency)`;
`stretch = budget × (1 + 0.5 × (1 − priceSensitivity))`.
cost > stretch ⇒ `defer` if value ≥ valueThreshold else `churn`; otherwise `convert` if value ≥ valueThreshold else `defer`.

## 6. Scheduling

Per round: `p = min(1, sessionsPerWeek / (7 × |activeHours| × 60/minutesPerRound) × (0.5 + activityLevel) × hourMultiplier × (1 if in active hours else outsideActiveHoursFactor))`
in the persona's time zone (`config/time.json`), rolled with the persona's seeded stream.

## 7. Load forecast assumptions

Requests/week per endpoint = Σ personas (calls measured per simulated week ÷ clones) × weight × users.
Peak req/s spreads weekly calls over the persona's active hours × the peak multiplier.
Storage growth assumes 1 KiB per created object (`BYTES_PER_OBJECT`). Volume mode replaces
estimates with measured latencies (p50/p95/p99).
