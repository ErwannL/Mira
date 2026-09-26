import { SSO_ISSUER, SSO_TTL_S, verifyJwtSignature } from '../shared/jwt.js';
import { TARGET_NAME } from '../shared/targets.js';

export type SsoError =
  | 'MALFORMED'
  | 'BAD_ALG'
  | 'BAD_SIGNATURE'
  | 'BAD_ISSUER'
  | 'BAD_AUDIENCE'
  | 'EXPIRED'
  | 'BAD_LIFETIME'
  | 'NO_OPERATOR'
  | 'BAD_TARGET'
  | 'REUSED';

/**
 * Verifies an admin-console SSO token: HS256 signature, iss, aud, exp (≤ 60 s lifetime). The
 * optional signed `target` claim names the Orqea environment the console inspects (`local`,
 * `recette`); whether that name is configured is decided later, when a run uses it.
 */
export function verifySsoToken(
  token: string,
  o: { secret: string; appId: string; nowS: number },
): { operator: string; exp: number; target: string | null } | { error: SsoError } {
  const r = verifyJwtSignature(token, o.secret);
  if ('error' in r) return r;
  const { iss, aud, exp, iat, operator, target } = r.payload;
  if (iss !== SSO_ISSUER) return { error: 'BAD_ISSUER' };
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(o.appId)) return { error: 'BAD_AUDIENCE' };
  if (typeof exp !== 'number' || exp <= o.nowS) return { error: 'EXPIRED' };
  // A console must not mint long-lived tokens: at most 60 s (+5 s clock skew) from now or from iat.
  const from = typeof iat === 'number' ? iat : o.nowS;
  if (exp - from > SSO_TTL_S + 5 || exp - o.nowS > SSO_TTL_S + 5) return { error: 'BAD_LIFETIME' };
  if (typeof operator !== 'string' || operator.trim() === '') return { error: 'NO_OPERATOR' };
  if (target !== undefined && (typeof target !== 'string' || !TARGET_NAME.test(target)))
    return { error: 'BAD_TARGET' };
  return { operator: operator.slice(0, 120), exp, target: target ?? null };
}
