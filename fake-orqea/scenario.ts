import { z } from 'zod';

/** Friction scenarios the fake can play, per run (selected by the X-Synthetic-Run header). */
export const scenarioSchema = z
  .object({
    extraSignupFields: z.number().int().min(0).max(6),
    unclearErrors: z.boolean(),
    captcha: z.boolean(),
    lockedFeatures: z.array(z.string()),
    boardLimit: z.number().int().min(1),
    slowMs: z.number().int().min(0).max(30_000),
    unnamedControls: z.boolean(),
    untranslated: z.boolean(),
    cookieBanner: z.boolean(),
    longOnboarding: z.boolean(),
  })
  .strict();

export type Scenario = z.infer<typeof scenarioSchema>;

const baseline: Scenario = {
  extraSignupFields: 0,
  unclearErrors: false,
  captcha: false,
  lockedFeatures: ['automation', 'qr', 'bulk', 'export'],
  boardLimit: 3,
  slowMs: 0,
  unnamedControls: false,
  untranslated: false,
  cookieBanner: true,
  longOnboarding: false,
};

export const PRESETS: Record<string, Scenario> = {
  baseline,
  /** A/B "B" side: shorter onboarding, no cookie wall, everything clear. */
  improved: { ...baseline, cookieBanner: false },
  /** The signup a volunteer should not get through. */
  'unclear-signup': {
    ...baseline,
    extraSignupFields: 4,
    unclearErrors: true,
    captcha: true,
    longOnboarding: true,
  },
  inaccessible: { ...baseline, unnamedControls: true },
  untranslated: { ...baseline, untranslated: true },
  slow: { ...baseline, slowMs: 4000 },
  'all-unlocked': { ...baseline, lockedFeatures: [] },
};

export function resolveScenario(input: unknown): Scenario {
  if (typeof input === 'string') {
    const preset = PRESETS[input];
    if (!preset) throw new Error(`Unknown scenario preset ${input}`);
    return preset;
  }
  const obj = z.object({ preset: z.string().optional() }).passthrough().parse(input);
  const { preset, ...rest } = obj;
  return scenarioSchema.parse({ ...resolveScenario(preset ?? 'baseline'), ...rest });
}

export class ScenarioRegistry {
  private perRun = new Map<string, Scenario>();
  constructor(private readonly fallback: Scenario) {}
  set(runId: string, s: Scenario): void {
    this.perRun.set(runId, s);
  }
  get(runId: string | null): Scenario {
    return (runId && this.perRun.get(runId)) || this.fallback;
  }
  delete(runId: string): void {
    this.perRun.delete(runId);
  }
}
