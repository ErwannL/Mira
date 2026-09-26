import { describe, expect, it } from 'vitest';
import { signRunHeader } from '../../shared/synthetic.js';
import { makeFake, NOW, SECRET } from '../test-helpers/fake.js';
import { emailIssues, passwordIssues, usernameIssues } from './auth.js';

const good = { email: 'ann@example.com', password: 'Str0ngPassword1!', acceptedTerms: true };

describe('auth api (Orqea routes/api/auth.js shapes)', () => {
  it('registers (201 + emailDelivery), 409 on duplicates, 400 {message, issues}', async () => {
    const f = await makeFake();
    const r = await f.call('POST', '/api/auth/register', { ...good, username: 'ann_b' });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({
      email: 'ann@example.com',
      username: 'ann_b',
      emailDelivery: 'queued',
    });
    expect(typeof r.json.id).toBe('number');
    expect((await f.call('POST', '/api/auth/register', good)).json).toEqual({
      message: 'User already exists',
    });
    const bad = async (body?: object) => (await f.call('POST', '/api/auth/register', body)).json;
    expect(await bad()).toEqual({ message: 'Missing email or password' });
    expect(await bad({ email: 'x@y.z' })).toEqual({ message: 'Missing email or password' });
    expect(await bad({ ...good, email: 'no' })).toMatchObject({ message: 'Invalid username' });
    expect(await bad({ ...good, email: 'nope' })).toEqual({
      message: 'Invalid email',
      issues: ['Email must contain an @ symbol'],
    });
    expect(await bad({ ...good, password: 'short' })).toMatchObject({ message: 'Weak password' });
    // Orqea's API does not enforce the terms: only its web form does.
    expect(
      (
        await f.call('POST', '/api/auth/register', {
          ...good,
          email: 'bob@c.de',
          acceptedTerms: false,
        })
      ).status,
    ).toBe(201);
  });

  it('validation rules match Orqea', () => {
    expect(emailIssues('a@b.co')).toEqual([]);
    expect(emailIssues('@b.co')).toEqual(['Email must have a local part before @ symbol']);
    expect(emailIssues('a@b')).toEqual(['Domain format is invalid (e.g., example.com)']);
    expect(emailIssues('a@')).toEqual(['Domain format is invalid (e.g., example.com)']);
    expect(emailIssues('a b@c.de')).toEqual(['Email cannot contain spaces']);
    expect(passwordIssues('Aa1!aaaa')).toEqual([]);
    expect(passwordIssues('aaaaaaaa')).toHaveLength(3);
    expect(usernameIssues('ab')).toHaveLength(1);
    expect(usernameIssues('a'.repeat(31))).toHaveLength(1);
    expect(usernameIssues('synth+r1-x')).toEqual([
      'Username can only contain letters, numbers, underscore, or dash',
    ]);
  });

  it('extra required fields, unclear errors and captcha scenarios (fake-only)', async () => {
    const f = await makeFake({}, { extraSignupFields: 2, unclearErrors: true, captcha: true });
    expect((await f.call('POST', '/api/auth/register', good)).json).toEqual({ message: 'Error.' });
    const filled = { ...good, extra_firstName: 'A', extra_lastName: 'B' };
    expect((await f.call('POST', '/api/auth/register', filled)).status).toBe(400);
    expect((await f.call('POST', '/api/auth/register', { ...filled, captcha: true })).status).toBe(
      201,
    );
    const clear = await makeFake({}, { extraSignupFields: 1, captcha: true });
    expect((await clear.call('POST', '/api/auth/register', good)).json).toEqual({
      message: 'Missing required fields',
    });
    expect(
      (await clear.call('POST', '/api/auth/register', { ...good, extra_firstName: 'A' })).json,
    ).toEqual({ message: 'Captcha required' });
    const run = { 'x-synthetic-run': signRunHeader('r1', SECRET, NOW) };
    const s = await f.call(
      'POST',
      '/api/auth/register',
      { ...filled, email: 'synth+r1-student@synthetic.invalid', username: 'sr1_student' },
      run,
    );
    expect(s.status).toBe(201);
    expect(s.headers['x-captcha-would-show']).toBe('1');
    expect(f.deps.store.userByEmail('synth+r1-student@synthetic.invalid')!.runId).toBe('r1');
  });

  it('verifies email once through the API, in JSON', async () => {
    const f = await makeFake();
    await f.call('POST', '/api/auth/register', good, { 'accept-language': 'fr-FR' });
    const u = f.deps.store.userByEmail(good.email)!;
    expect(u.language).toBe('fr');
    const token = u.verifyToken;
    expect((await f.call('GET', `/api/auth/verify-email?token=${token}`)).json).toEqual({
      message: 'Email verified',
    });
    expect(u.verified).toBe(true);
    expect((await f.call('GET', `/api/auth/verify-email?token=${token}`)).json).toEqual({
      message: 'Invalid or already used token',
    });
    expect((await f.call('GET', '/api/auth/verify-email')).json).toEqual({
      message: 'Missing token',
    });
  });

  it('logs in only verified users; brakes repeated failures except for signed synthetic runs', async () => {
    const f = await makeFake();
    await f.call('POST', '/api/auth/register', good);
    const login = () =>
      f.call('POST', '/api/auth/login', { email: good.email, password: good.password });
    expect((await login()).json).toEqual({ message: 'Email not verified' });
    f.deps.store.userByEmail(good.email)!.verified = true;
    const ok = await login();
    expect(ok.status).toBe(200);
    expect(typeof ok.json.token).toBe('string');
    expect((await f.call('POST', '/api/auth/login', {})).status).toBe(400);
    expect((await f.call('POST', '/api/auth/login')).status).toBe(400);
    expect(
      (await f.call('POST', '/api/auth/login', { email: 'x@y.zz', password: 'p' })).json,
    ).toEqual({ message: 'Invalid credentials' });
    for (let i = 0; i < 4; i++)
      await f.call('POST', '/api/auth/login', { email: good.email, password: 'wrong' });
    expect((await login()).status).toBe(429);
    const run = { 'x-synthetic-run': signRunHeader('r1', SECRET, NOW) };
    expect(
      (await f.call('POST', '/api/auth/login', { email: good.email, password: good.password }, run))
        .status,
    ).toBe(200);
  });
});
