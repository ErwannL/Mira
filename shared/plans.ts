import { z } from 'zod';

/** The readable plan list the target exposes (GET /api/billing/plans). */
export const planSchema = z.object({
  key: z.string(),
  name: z.string(),
  priceMonthly: z.number().min(0),
  currency: z.string(),
  perSeat: z.boolean(),
  features: z.array(z.string()),
});
export const plansResponseSchema = z.object({ plans: z.array(planSchema) });
export type Plan = z.infer<typeof planSchema>;
