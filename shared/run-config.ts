import { z } from 'zod';

export const RUN_STATUSES = [
  'draft',
  'queued',
  'preparing',
  'running',
  'reporting',
  'cleaning',
  'done',
  'failed',
  'refused',
  'cancelled',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const FINAL_STATUSES: RunStatus[] = ['done', 'failed', 'refused', 'cancelled'];

/** Allowed lifecycle transitions (cancel is allowed from any non-final state). */
export const TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  draft: ['queued', 'cancelled'],
  queued: ['preparing', 'cancelled'],
  preparing: ['running', 'refused', 'failed', 'cleaning', 'cancelled'],
  running: ['reporting', 'cleaning', 'failed'],
  reporting: ['cleaning', 'failed'],
  cleaning: ['done', 'failed', 'cancelled'],
  done: [],
  failed: [],
  refused: [],
  cancelled: [],
};

export const runConfigSchema = z
  .object({
    kind: z.enum(['journey', 'volume']),
    label: z.string().max(120).default(''),
    targetUrl: z.string().url(),
    allowRemote: z.boolean().default(false),
    confirmHost: z.string().max(253).nullable().default(null),
    personaIds: z.array(z.string()).default([]),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 31)
      .nullable()
      .default(null),
    startAt: z.string().datetime().default('2030-01-07T00:00:00Z'),
    totalSimulatedDays: z.number().min(0.01).max(90).default(7),
    minutesPerRound: z.number().int().min(5).max(1440).default(60),
    targetUsers: z.number().int().min(1).max(1_000_000).default(100),
    fakeScenario: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .nullable()
      .default(null),
    allowCheckout: z.boolean().default(false),
    priceScenarios: z
      .array(
        z
          .object({ name: z.string().min(1), prices: z.record(z.string(), z.number().min(0)) })
          .strict(),
      )
      .default([]),
    userScenarios: z.array(z.number().int().min(1)).default([100, 1000, 10000]),
  })
  .strict();

export type RunConfig = z.infer<typeof runConfigSchema>;
export type RunConfigInput = z.input<typeof runConfigSchema>;
