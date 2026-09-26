import { createHash } from 'node:crypto';
import { z } from 'zod';
import { personaSchema, type Persona } from './persona-schema.js';

/**
 * Vigie (github.com/ErwannL/Vigie, docs/CONTRACT.md §4) drives Figura service to service: it
 * replays an incident's navigation path as a scenario, and pushes personas mined from real
 * aggregates. This module holds the shapes and the pure translations; see docs/VIGIE.md.
 */

export const VIGIE_ACTIONS = ['visit', 'click', 'signup', 'login', 'use_feature', 'wait'] as const;

const traitsSchema = z.object({
  plan: z.string().min(1),
  device: z.string().min(1),
  locale: z.string().min(1),
});

export const vigieScenarioSchema = z.object({
  schema: z.literal(1),
  kind: z.literal('vigie.scenario').optional(),
  sourceEnv: z.string().min(1),
  targetEnv: z.string().min(1),
  incidentId: z.union([z.number(), z.string()]).nullable().optional(),
  persona: traitsSchema,
  steps: z
    .array(
      z.object({
        action: z.enum(VIGIE_ACTIONS),
        target: z.union([z.string(), z.number()]).nullable().optional(),
        expect: z
          .object({
            maxDurationMs: z.number().positive().optional(),
            status: z.number().int().optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type VigieScenario = z.infer<typeof vigieScenarioSchema>;
export type VigieStep = VigieScenario['steps'][number];

const share = z.number().min(0).max(1).nullable();
export const vigiePersonaSetSchema = z.object({
  schema: z.literal(1),
  kind: z.literal('vigie.persona_set').optional(),
  sourceEnv: z.string().min(1),
  targetEnv: z.string().min(1),
  personas: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        traits: traitsSchema,
        weights: z
          .object({
            features: z.record(z.string(), share).default({}),
            sessionLength: z
              .object({ medianMinutes: z.number().min(0).nullable().optional() })
              .partial()
              .optional(),
            dropOff: z.record(z.string(), z.record(z.string(), share)).optional(),
          })
          .default({ features: {} }),
        sample: z
          .object({ people: z.number().int().min(0) })
          .partial()
          .optional(),
      }),
    )
    .min(1)
    .max(100),
});
export type VigiePersonaSet = z.infer<typeof vigiePersonaSetSchema>;
type VigiePersona = VigiePersonaSet['personas'][number];

/** Vigie's product feature keys → catalogue use-case ids. A key that is already an id passes. */
export const FEATURE_TO_USE_CASE: Record<string, string> = {
  'board.create': 'create-board',
  'list.create': 'create-list',
  'card.create': 'create-card',
  'card.move': 'move-card',
  'card.edit': 'edit-card',
  'card.comment': 'comment',
  'card.priority': 'card-priority',
  'card.checklist': 'checklist',
  'card.bulk': 'bulk-actions',
  'member.invite': 'invite-member',
  'rule.create': 'automation-rule',
  'form.create': 'form-create',
  'qr.create': 'qr-create',
  'note.create': 'notes-reminder',
  'search.global': 'global-search',
  'calendar.view': 'calendar',
  'stats.view': 'stats',
  'billing.view': 'billing-view-plans',
};

export function useCaseOf(key: string, known: (id: string) => boolean): string | null {
  const id = FEATURE_TO_USE_CASE[key] ?? key;
  return known(id) ? id : null;
}

/** Vigie's `targetEnv` → a FIGURA_TARGETS name. Vigie says `dev` for Orqea's local stack. */
export function targetNameOf(targetEnv: string): string {
  const env = targetEnv.toLowerCase();
  return env === 'dev' ? 'local' : env;
}

/** Environments refused outright (the worker guard refuses them again by what the target reports). */
export const isProductionEnv = (targetEnv: string): boolean =>
  /^(prod|production|live)$/i.test(targetEnv);

export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A Figura persona from Vigie traits and weights. Only what the aggregates say is taken from them
 * (device, locale, plan, features used, session length, activation drop-off); every other trait is
 * a neutral default, stated in docs/VIGIE.md.
 */
export function personaFromVigie(
  id: string,
  name: string,
  p: Pick<VigiePersona, 'traits'> & Partial<Pick<VigiePersona, 'weights'>>,
  o: { known: (id: string) => boolean; populationWeight: number },
): Persona {
  const fr = p.traits.locale.toLowerCase().startsWith('fr');
  const device = /mobile|phone|tablet/i.test(p.traits.device)
    ? 'mobile'
    : /laptop/i.test(p.traits.device)
      ? 'laptop'
      : 'desktop';
  const paid = !/^free$/i.test(p.traits.plan);
  const features = Object.entries(p.weights?.features ?? {})
    .filter(([, w]) => (w ?? 0) > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([k]) => useCaseOf(k, o.known))
    .filter((x): x is string => x !== null);
  const goalFeatures = [...new Set(['create-board', ...features])];
  const lost = Object.values(p.weights?.dropOff?.activation ?? {}).filter(
    (v): v is number => typeof v === 'number',
  );
  const meanLoss = lost.length ? lost.reduce((s, v) => s + v, 0) / lost.length : 0.4;
  const minutes = p.weights?.sessionLength?.medianMinutes ?? 15;
  return personaSchema.parse({
    id,
    displayName: `Vigie ${name}`,
    bio: `Built by Vigie from ${p.traits.plan} ${p.traits.device} users (${p.traits.locale}).`,
    locale: fr ? 'fr' : 'en',
    device,
    timezone: fr ? 'Europe/Paris' : 'Europe/London',
    goal: `Behave like the ${name} group observed by Vigie`,
    goalFeatures,
    urgency: 0.5,
    techSavvy: 0.5,
    readingTolerance: 0.5,
    errorProneness: 0.3,
    patience: 0.5,
    frictionTolerance: round2(clamp(1 - meanLoss, 0.1, 0.9)),
    recoveryWillingness: 0.5,
    curiosity: 0.4,
    tutorialAffinity: 0.4,
    teamSize: paid ? 5 : 1,
    invitesOthers: paid ? 0.6 : 0.2,
    budget: paid ? 60 : 10,
    priceSensitivity: paid ? 0.3 : 0.7,
    valueThreshold: 0.5,
    privacyConcern: 0.4,
    activityLevel: 0.6,
    sessionsPerWeek: 4,
    activeHours: [9, 10, 11, 12, 14, 15, 16, 17, 18],
    sessionLengthMin: Math.max(1, Math.round(minutes)),
    populationWeight: round2(clamp(o.populationWeight, 0, 1)),
  });
}

/** The personas of a set, ids `vigie-<name>` (never a catalogue persona id), weights by people. */
export function personasOfSet(set: VigiePersonaSet, known: (id: string) => boolean): Persona[] {
  const people = set.personas.map((p) => p.sample?.people ?? 1);
  const total = people.reduce((s, n) => s + n, 0) || 1;
  return set.personas.map((p, i) =>
    personaFromVigie(`vigie-${slug(p.name)}`, p.name, p, {
      known,
      populationWeight: (people[i] as number) / total,
    }),
  );
}

/** Idempotency key of a set: Vigie sends none, so the content is its identity. */
export const setIdOf = (set: VigiePersonaSet): string =>
  createHash('sha256').update(JSON.stringify(set)).digest('hex').slice(0, 32);
