import { readFileSync } from 'node:fs';
import { z } from 'zod';

const n = z.number().min(0);
export const frictionWeightsSchema = z
  .object({
    version: z.string(),
    freeFields: n,
    perExtraField: n,
    perRequiredField: n,
    wordsBudgetBase: n,
    wordsBudgetScale: n,
    wordsScale: z.number().positive(),
    words: n,
    perExtraClick: n,
    ttiFreeMs: n,
    ttiScaleMs: z.number().positive(),
    tti: n,
    networkError: n,
    validationError: n,
    unclearError: n,
    unnamedControl: n,
    captcha: n,
    cookieBanner: n,
    termsCheckbox: n,
    paywall: n,
    overflowMobile: n,
    overflowOther: n,
    foreignText: n,
    learnedFactor: z.number().min(0).max(1),
    decayPerStep: z.number().min(0).max(1),
    decayPerSession: z.number().min(0).max(1),
    successRelief: n,
    toleranceBase: n,
    toleranceScale: n,
    maxRetries: z.number().int().min(0),
  })
  .strict();

export type FrictionWeights = z.infer<typeof frictionWeightsSchema>;

export function loadWeights(path: string): FrictionWeights {
  return frictionWeightsSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
