import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { accessibleNameSchema } from './catalogue-schema.js';

/** Accessible names of cross-cutting UI (cookie banner) — configurable per target. */
export const commonUiSchema = z
  .object({
    version: z.string(),
    cookieAccept: accessibleNameSchema,
    cookieReject: accessibleNameSchema,
    cookieDialog: accessibleNameSchema,
  })
  .strict();
export type CommonUi = z.infer<typeof commonUiSchema>;

export function loadCommonUi(path: string): CommonUi {
  return commonUiSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}
