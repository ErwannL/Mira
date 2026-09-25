import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { mintSsoToken, signJwt, verifyJwtSignature, SSO_ISSUER } from './jwt.js';

const secret = 'k'.repeat(32);
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('jwt', () => {
  it('signs and verifies', () => {
    const t = signJwt({ a: 1 }, secret);
    expect(verifyJwtSignature(t, secret)).toEqual({ payload: { a: 1 } });
  });
  it('rejects tampering, wrong secret, other algorithms and garbage', () => {
    const t = signJwt({ a: 1 }, secret);
    const [h, , s] = t.split('.');
    expect(verifyJwtSignature(`${h}.${b64({ a: 2 })}.${s}`, secret)).toEqual({ error: 'BAD_SIGNATURE' });
    expect(verifyJwtSignature(t, 'x'.repeat(32))).toEqual({ error: 'BAD_SIGNATURE' });
    expect(verifyJwtSignature(`${b64({ alg: 'none' })}.${b64({ a: 1 })}.`, secret)).toEqual({ error: 'BAD_ALG' });
    expect(verifyJwtSignature('a.b', secret)).toEqual({ error: 'MALFORMED' });
    expect(verifyJwtSignature('%%%.%%%.x', secret)).toEqual({ error: 'MALFORMED' });
    const nullBody = signJwt({}, secret).split('.');
    const hb = `${nullBody[0]}.${b64(null)}`;
    const sig = createHmac('sha256', secret).update(hb).digest('base64url');
    expect(verifyJwtSignature(`${hb}.${sig}`, secret)).toEqual({ error: 'MALFORMED' });
  });
  it('mints SSO tokens with iss/aud/exp=60s', () => {
    const r = verifyJwtSignature(mintSsoToken(secret, 'figura', 'Ops', 100), secret) as { payload: Record<string, unknown> };
    expect(r.payload).toEqual({ iss: SSO_ISSUER, aud: 'figura', operator: 'Ops', iat: 100, exp: 160 });
  });
});
