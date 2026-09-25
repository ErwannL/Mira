import { z } from 'zod';

/** Accessible name per UI language — never a CSS selector. */
export const accessibleNameSchema = z.object({ en: z.string(), fr: z.string() }).strict();
export const targetSchema = z
  .object({
    role: z.string(),
    name: accessibleNameSchema,
    /** Optional: match the name exactly (default: substring match). */
    exact: z.boolean().optional(),
  })
  .strict();

export const uiStepSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('goto'), path: z.string() }).strict(),
  z.object({ action: z.literal('click'), target: targetSchema }).strict(),
  z.object({ action: z.literal('fill'), target: targetSchema, value: z.string() }).strict(),
  z.object({ action: z.literal('check'), target: targetSchema }).strict(),
  z.object({ action: z.literal('select'), target: targetSchema, value: z.string() }).strict(),
  z.object({ action: z.literal('drag'), target: targetSchema, to: targetSchema }).strict(),
  z.object({ action: z.literal('press'), key: z.string() }).strict(),
  z.object({ action: z.literal('openVerifyUrl') }).strict(),
  z.object({ action: z.literal('expect'), target: targetSchema }).strict(),
]);

export const apiStepSchema = z
  .object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    path: z.string().startsWith('/'),
    /** Body builder: a JSON template whose "{{var}}" strings are substituted from the persona context. */
    body: z.unknown().optional(),
    auth: z.boolean().optional(),
    /** Context variables to capture from the JSON response: { varName: "dotted.path" }. */
    save: z.record(z.string(), z.string()).optional(),
    expectStatus: z.array(z.number().int()).optional(),
  })
  .strict();

export const useCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.object({ en: z.string(), fr: z.string() }).strict(),
    area: z.string(),
    requires: z.array(z.string()),
    planGate: z.string(),
    /** Minutes a typical session spends on this use case (drives session budget). */
    minutes: z.number().positive(),
    /** Which synthetic mistakes the engine may inject into this use case. */
    mistakes: z.array(z.enum(['typoEmail', 'weakPassword', 'forgetTerms'])).optional(),
    ui: z.array(uiStepSchema).min(1),
    api: z.array(apiStepSchema),
    success: z.object({ ui: targetSchema.optional(), apiStatus: z.number().int().optional() }).strict(),
    frictionHints: z
      .object({ fields: z.number().int().min(0), clicks: z.number().int().min(0), words: z.number().int().min(0) })
      .strict(),
  })
  .strict();

export type UseCase = z.infer<typeof useCaseSchema>;
export type UiStep = z.infer<typeof uiStepSchema>;
export type ApiStep = z.infer<typeof apiStepSchema>;
export type UiTarget = z.infer<typeof targetSchema>;

export interface Catalogue {
  version: string;
  useCases: UseCase[];
}
