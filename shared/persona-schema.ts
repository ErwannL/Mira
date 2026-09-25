import { z } from 'zod';

const unit = z.number().min(0).max(1);
const hour = z.number().int().min(0).max(23);

export const personaSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    displayName: z.string().min(1),
    bio: z.string().min(1),
    locale: z.enum(['en', 'fr']),
    device: z.enum(['desktop', 'laptop', 'mobile']),
    timezone: z.string().min(1),
    goal: z.string().min(1),
    goalFeatures: z.array(z.string()).min(1),
    urgency: unit,
    techSavvy: unit,
    readingTolerance: unit,
    errorProneness: unit,
    patience: unit,
    frictionTolerance: unit,
    recoveryWillingness: unit,
    curiosity: unit,
    tutorialAffinity: unit,
    teamSize: z.number().int().min(1),
    invitesOthers: unit,
    budget: z.number().min(0),
    priceSensitivity: unit,
    valueThreshold: unit,
    privacyConcern: unit,
    activityLevel: unit,
    sessionsPerWeek: z.number().min(0),
    activeHours: z.array(hour).min(1),
    sessionLengthMin: z.number().int().min(1),
    populationWeight: unit,
    /** Extension (see docs/DECISIONS.md): assistive-technology profile. */
    assistive: z.object({ screenReader: z.boolean(), keyboardOnly: z.boolean() }).optional(),
  })
  .strict();

export type Persona = z.infer<typeof personaSchema>;

export const timeConfigSchema = z
  .object({
    version: z.string(),
    peakHours: z.array(hour),
    workHours: z.array(hour),
    morningHours: z.array(hour),
    multipliers: z.object({ peak: z.number(), work: z.number(), morning: z.number(), offPeak: z.number() }),
    outsideActiveHoursFactor: unit,
  })
  .strict();

export type TimeConfig = z.infer<typeof timeConfigSchema>;

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false },
  laptop: { width: 1280, height: 800, isMobile: false, hasTouch: false },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
} as const;
