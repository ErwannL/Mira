import { describe, expect, it } from 'vitest';
import { signRunHeader } from '../../shared/synthetic.js';
import { makeFake, NOW, SECRET } from '../test-helpers/fake.js';

const good = { email: 'ann@example.com', password: 'Str0ngPassword', acceptedTerms: true };

describe('auth api', () => {
  it('registers (201), refuses duplicates (409) and explains 400s', async () => {
    const f = await makeFake();
    const r = await f.call('POST', '/api/auth/register', { ...good, username: 'ann' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ email: 'ann@example.com', username: 'ann' });
    expect((await f.call('POST', '/api/auth/register', good)).status).toBe(409);
    const bad = async (body: object) => (await f.call('POST', '/api/auth/register', body)).json;
    expect(await bad({ ...good, email: 'nope' })).toMatchObject({
      error: 'INVALID_EMAIL',
      message: expect.stringContaining('name@example.com'),
    });
    expect(await bad({ ...good, password: 'short' })).toMatchObject({ error: 'WEAK_PASSWORD' });
    expect(await bad({ ...good, acceptedTerms: false })).toMatchObject({ error: 'TERMS_REQUIRED' });
    expect(await bad({})).toMatchObject({ error: 'INVALID_EMAIL' });
    expect(await bad({ email: good.email })).toMatchObject({ error: 'WEAK_PASSWORD' });
    expect((await f.call('POST', '/api/auth/register')).json.error).toBe('INVALID_EMAIL');
  });

  it('extra required fields, unclear errors and captcha scenarios', async () => {
    const f = await makeFake({}, { extraSignupFields: 2, unclearErrors: true, captcha: true });
    const r = await f.call('POST', '/api/auth/register', good);
    expect(r.json).toEqual({ error: 'MISSING_FIELD', message: 'Error.' });
    const filled = { ...good, extra_firstName: 'A', extra_lastName: 'B' };
    expect((await f.call('POST', '/api/auth/register', filled)).json.error).toBe('CAPTCHA');
    expect((await f.call('POST', '/api/auth/register', { ...filled, captcha: true })).status).toBe(
      201,
    );
    const run = { 'x-synthetic-run': signRunHeader('r1', SECRET, NOW) };
    const s = await f.call(
      'POST',
      '/api/auth/register',
      { ...filled, email: 'synth+r1-student@synthetic.invalid' },
      run,
    );
    expect(s.status).toBe(201);
    expect(s.headers['x-captcha-would-show']).toBe('1');
    expect(f.deps.store.userByEmail('synth+r1-student@synthetic.invalid')!.runId).toBe('r1');
  });

  it('verifies email through the link, as HTML or JSON', async () => {
    const f = await makeFake();
    await f.call('POST', '/api/auth/register', good, { 'accept-language': 'fr-FR' });
    const u = f.deps.store.userByEmail(good.email)!;
    expect(u.language).toBe('fr');
    const html = await f.call('GET', `/api/auth/verify-email?token=${u.verifyToken}`, undefined, {
      accept: 'text/html',
    });
    expect(html.body).toContain('Adresse vérifiée');
    expect(u.verified).toBe(true);
    expect((await f.call('GET', `/api/auth/verify-email?token=${u.verifyToken}`)).json).toEqual({
      verified: true,
    });
    const badHtml = await f.call('GET', '/api/auth/verify-email?token=zzz', undefined, {
      accept: 'text/html',
    });
    expect(badHtml.status).toBe(400);
    expect(badHtml.body).toContain('invalid');
    expect((await f.call('GET', '/api/auth/verify-email')).json).toEqual({
      error: 'INVALID_TOKEN',
    });
  });

  it('logs in only verified users; brakes repeated failures except for signed synthetic runs', async () => {
    const f = await makeFake();
    await f.call('POST', '/api/auth/register', good);
    const login = () =>
      f.call('POST', '/api/auth/login', { email: good.email, password: good.password });
    expect((await login()).status).toBe(403);
    f.deps.store.userByEmail(good.email)!.verified = true;
    const ok = await login();
    expect(ok.status).toBe(200);
    expect(typeof ok.json.token).toBe('string');
    expect((await f.call('POST', '/api/auth/login', {})).status).toBe(401);
    expect((await f.call('POST', '/api/auth/login')).status).toBe(401);
    expect((await f.call('POST', '/api/auth/login', { email: good.email })).status).toBe(401);
    for (let i = 0; i < 5; i++)
      await f.call('POST', '/api/auth/login', { email: good.email, password: 'wrong' });
    expect((await login()).status).toBe(429);
    const run = { 'x-synthetic-run': signRunHeader('r1', SECRET, NOW) };
    expect(
      (await f.call('POST', '/api/auth/login', { email: good.email, password: good.password }, run))
        .status,
    ).toBe(200);
  });
});
