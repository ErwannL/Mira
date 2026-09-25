import { describe, expect, it } from 'vitest';
import { verifyJwtSignature } from '../shared/jwt.js';
import { makeFake, SSO } from './test-helpers/fake.js';

describe('fake admin console', () => {
  it('embeds the app with a fresh SSO token and offers fallbacks', async () => {
    const f = await makeFake();
    const page = await f.call('GET', '/console');
    expect(page.body).toMatch(
      /<iframe id="app" title="Synthetic users simulator" src="http:\/\/localhost:4000\/#sso=[\w-]+\.[\w-]+\.[\w-]+"/,
    );
    expect(page.body).toContain('Open in new tab');
    expect(page.body).toContain('8000');
    const tok = await f.call('GET', '/console/token');
    expect(tok.json.expiresIn).toBe(60);
    const verified = verifyJwtSignature(tok.json.token as string, SSO) as {
      payload: Record<string, unknown>;
    };
    expect(verified.payload).toMatchObject({ iss: 'orqea-admin-console', aud: 'figura' });
    const open = await f.call('GET', '/console/open');
    expect(open.status).toBe(302);
    expect(open.headers.location).toMatch(/^http:\/\/localhost:4000\/#sso=/);
  });
  it('is local only', async () => {
    const f = await makeFake();
    const r = await f.app.inject({ method: 'GET', url: '/console', remoteAddress: '8.8.8.8' });
    expect(r.statusCode).toBe(404);
    const allowed = await makeFake({ adminAllowed: ['172.18.'] });
    expect(
      (
        await allowed.app.inject({
          method: 'GET',
          url: '/console/token',
          remoteAddress: '172.18.0.5',
        })
      ).statusCode,
    ).toBe(200);
  });
});
