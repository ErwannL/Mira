import { z } from 'zod';
import { plansResponseSchema, type Plan } from '../../shared/plans.js';
import { signRunHeader } from '../../shared/synthetic.js';

export const targetInfoSchema = z.object({
  env: z.string(),
  stripeMode: z.enum(['test', 'live', 'off']),
  syntheticEnabled: z.boolean(),
  version: z.string(),
});
export type TargetInfo = z.infer<typeof targetInfoSchema>;
export const endpointsSchema = z.object({ endpoints: z.array(z.object({ method: z.string(), path: z.string() }).passthrough()) });
export type Endpoint = { method: string; path: string };
const cleanupSchema = z.object({ before: z.number(), after: z.number(), residualRows: z.number() });
export type CleanupResult = z.infer<typeof cleanupSchema>;

export const PATHS = {
  target: 'GET /api/admin/synthetic/target',
  verification: 'POST /api/admin/synthetic/verification',
  cleanup: 'POST /api/admin/synthetic/cleanup',
  endpoints: 'GET /api',
  plans: 'GET /api/billing/plans',
} as const;

/** Thrown when the target does not implement the contract (docs/ORQEA_CONTRACT.md). */
export class ContractError extends Error {
  constructor(readonly endpoint: string, readonly status: number, detail: string) {
    super(`${endpoint} → ${status}: ${detail}`);
  }
}

export interface ClientOptions {
  baseUrl: string;
  serviceSecret: string;
  runId: string;
  fetchImpl: typeof fetch;
  nowS: () => number;
}

/** Client side of the Orqea contract. */
export class OrqeaClient {
  constructor(private readonly o: ClientOptions) {}

  runHeader(): string {
    return signRunHeader(this.o.runId, this.o.serviceSecret, this.o.nowS());
  }

  private async call<T>(spec: string, schema: z.ZodType<T>, body?: unknown, admin = false): Promise<T> {
    const [method, path] = spec.split(' ') as [string, string];
    const headers: Record<string, string> = { accept: 'application/json', 'x-synthetic-run': this.runHeader() };
    if (admin) headers.authorization = `Bearer ${this.o.serviceSecret}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await this.o.fetchImpl(this.o.baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new ContractError(spec, 0, (e as Error).message);
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new ContractError(spec, res.status, 'unexpected status');
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ContractError(spec, res.status, 'unexpected payload');
    return parsed.data;
  }

  targetInfo(): Promise<TargetInfo> {
    return this.call(PATHS.target, targetInfoSchema, undefined, true);
  }

  async endpoints(): Promise<Endpoint[]> {
    return (await this.call(PATHS.endpoints, endpointsSchema)).endpoints;
  }

  async plans(): Promise<Plan[]> {
    return (await this.call(PATHS.plans, plansResponseSchema)).plans;
  }

  async requestVerifyUrl(email: string): Promise<string> {
    return (await this.call(PATHS.verification, z.object({ verifyUrl: z.string().url() }), { email, runId: this.o.runId }, true)).verifyUrl;
  }

  cleanup(): Promise<CleanupResult> {
    return this.call(PATHS.cleanup, cleanupSchema, { runId: this.o.runId }, true);
  }

  /** Fake-Orqea only: friction scenario for this run. */
  async setScenario(scenario: unknown): Promise<void> {
    await this.call(`PUT /__control/scenario/${this.o.runId}`, z.object({ ok: z.literal(true) }), scenario, true);
  }
}
