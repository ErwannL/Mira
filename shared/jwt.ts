import { createHmac } from 'node:crypto';
import { safeEqual } from './synthetic.js';

const b64url = (buf: Buffer | string): string => Buffer.from(buf).toString('base64url');

/** Minimal HS256 JWT (no dependency): only what the SSO contract needs. */
export function signJwt(payload: Record<string, unknown>, secret: string): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export type JwtError = 'MALFORMED' | 'BAD_ALG' | 'BAD_SIGNATURE';

export function verifyJwtSignature(
  token: string,
  secret: string,
): { payload: Record<string, unknown> } | { error: JwtError } {
  const parts = token.split('.');
  if (parts.length !== 3) return { error: 'MALFORMED' };
  const [head, body, sig] = parts as [string, string, string];
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { error: 'MALFORMED' };
  }
  if ((header as { alg?: unknown }).alg !== 'HS256') return { error: 'BAD_ALG' };
  const expected = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  if (!safeEqual(sig, expected)) return { error: 'BAD_SIGNATURE' };
  if (payload === null || typeof payload !== 'object') return { error: 'MALFORMED' };
  return { payload: payload as Record<string, unknown> };
}

export const SSO_ISSUER = 'orqea-admin-console';
export const SSO_TTL_S = 60;

export function mintSsoToken(
  secret: string,
  audience: string,
  operator: string,
  nowS: number,
): string {
  return signJwt(
    { iss: SSO_ISSUER, aud: audience, operator, iat: nowS, exp: nowS + SSO_TTL_S },
    secret,
  );
}
