import { SSO_ISSUER, SSO_TTL_S, verifyJwtSignature } from '../shared/jwt.js';

export type SsoError =
  | 'MALFORMED'
  | 'BAD_ALG'
  | 'BAD_SIGNATURE'
  | 'BAD_ISSUER'
  | 'BAD_AUDIENCE'
  | 'EXPIRED'
  | 'BAD_LIFETIME'
  | 'NO_OPERATOR'
  | 'REUSED';

/** Verifies an admin-console SSO token: HS256 signature, iss, aud, exp (≤ 60 s lifetime). */
export function verifySsoToken(
  token: string,
  o: { secret: string; appId: string; nowS: number },
): { operator: string; exp: number } | { error: SsoError } {
  const r = verifyJwtSignature(token, o.secret);
  if ('error' in r) return r;
  const { iss, aud, exp, iat, operator } = r.payload;
  if (iss !== SSO_ISSUER) return { error: 'BAD_ISSUER' };
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(o.appId)) return { error: 'BAD_AUDIENCE' };
  if (typeof exp !== 'number' || exp <= o.nowS) return { error: 'EXPIRED' };
  // A console must not mint long-lived tokens: at most 60 s (+5 s clock skew) from now or from iat.
  const from = typeof iat === 'number' ? iat : o.nowS;
  if (exp - from > SSO_TTL_S + 5 || exp - o.nowS > SSO_TTL_S + 5) return { error: 'BAD_LIFETIME' };
  if (typeof operator !== 'string' || operator.trim() === '') return { error: 'NO_OPERATOR' };
  return { operator: operator.slice(0, 120), exp };
}
