import { isLoopbackHost } from '../../shared/synthetic.js';
import {
  ContractError,
  PATHS,
  type Endpoint,
  type OrqeaClient,
  type TargetInfo,
} from './client.js';

export type RefusalCode =
  | 'PRODUCTION_ENV'
  | 'REMOTE_HOST_UNCONFIRMED'
  | 'SYNTHETIC_DISABLED'
  | 'VOLUME_CAP'
  | `ORQEA_CONTRACT_MISSING:${string}`;

/** Sentences shown verbatim in the UI next to the code. */
export const REFUSAL_MESSAGES = {
  PRODUCTION_ENV:
    'The target reports a production environment. Synthetic users never run against production, and this cannot be overridden.',
  REMOTE_HOST_UNCONFIRMED:
    'The target is not on this machine. Tick "allow remote target" and retype the exact host name to confirm.',
  SYNTHETIC_DISABLED:
    'The target has synthetic mode turned off. Enable it on the target (non-production only) and try again.',
  VOLUME_CAP:
    'This run would exceed the configured volume caps (accounts, requests per second or rows). Lower the number of users.',
  ORQEA_CONTRACT_MISSING:
    'The target does not implement a required endpoint of the Orqea contract (see docs/ORQEA_CONTRACT.md).',
} as const;

/** Environments that are explicitly safe. Anything else — including an unknown env — counts as production. */
const SAFE_ENVS = /^(dev|development|local|test|testing|ci|staging|preview|qa|synthetic)$/i;

export const REQUIRED_ENDPOINTS = [
  'POST /api/auth/register',
  'GET /api/auth/verify-email',
  'POST /api/auth/login',
  'GET /api',
  'GET /api/billing/plans',
  PATHS.target,
  PATHS.verification,
  PATHS.cleanup,
];

export interface GuardInput {
  targetUrl: string;
  allowRemote: boolean;
  confirmHost: string | null;
  /** Hosts declared local by the operator (e.g. the compose service name "fake-orqea"). */
  localHosts: string[];
  /** Hosts that are production, whatever the target says. */
  productionHosts: string[];
  requested: { accounts: number; requestsPerSecond: number; rows: number };
  caps: { accounts: number; requestsPerSecond: number; rows: number };
}

export type GuardResult =
  | { ok: true; info: TargetInfo; endpoints: Endpoint[] }
  | { ok: false; code: RefusalCode; message: string };

const refuse = (
  code: RefusalCode,
  base: keyof typeof REFUSAL_MESSAGES = code as keyof typeof REFUSAL_MESSAGES,
): GuardResult => ({ ok: false, code, message: REFUSAL_MESSAGES[base] });

/** Runs before any work touches the target. PRODUCTION_ENV has no bypass. */
export async function guardTarget(
  input: GuardInput,
  client: Pick<OrqeaClient, 'targetInfo' | 'endpoints'>,
): Promise<GuardResult> {
  const host = new URL(input.targetUrl).hostname.toLowerCase();
  if (input.productionHosts.map((h) => h.toLowerCase()).includes(host))
    return refuse('PRODUCTION_ENV');
  const local = isLoopbackHost(host) || input.localHosts.map((h) => h.toLowerCase()).includes(host);
  if (!local && !(input.allowRemote && (input.confirmHost ?? '').trim().toLowerCase() === host)) {
    return refuse('REMOTE_HOST_UNCONFIRMED');
  }
  let info: TargetInfo;
  let endpoints: Endpoint[];
  try {
    info = await client.targetInfo();
    if (!SAFE_ENVS.test(info.env)) return refuse('PRODUCTION_ENV');
    if (!info.syntheticEnabled) return refuse('SYNTHETIC_DISABLED');
    endpoints = await client.endpoints();
  } catch (e) {
    if (e instanceof ContractError)
      return refuse(`ORQEA_CONTRACT_MISSING:${e.endpoint}`, 'ORQEA_CONTRACT_MISSING');
    throw e;
  }
  const have = new Set(endpoints.map((e) => `${e.method.toUpperCase()} ${e.path}`));
  const missing = REQUIRED_ENDPOINTS.find((r) => !have.has(r));
  if (missing) return refuse(`ORQEA_CONTRACT_MISSING:${missing}`, 'ORQEA_CONTRACT_MISSING');
  const { requested: r, caps: c } = input;
  if (r.accounts > c.accounts || r.requestsPerSecond > c.requestsPerSecond || r.rows > c.rows)
    return refuse('VOLUME_CAP');
  return { ok: true, info, endpoints };
}
