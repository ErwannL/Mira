import type { FakeConfig } from '../context.js';
import { PRESETS, type Scenario } from '../scenario.js';
import { buildFakeOrqea } from '../server.js';

export const SECRET = 'service-secret-'.padEnd(40, 'x');
export const SSO = 'sso-secret-'.padEnd(40, 'y');
export const NOW = 1_900_000_000;

export function testConfig(overrides: Partial<FakeConfig> = {}): FakeConfig {
  return {
    serviceSecret: SECRET,
    env: 'development',
    stripeMode: 'test',
    syntheticEnabled: true,
    adminAllowed: [],
    version: 'fake-test',
    ssoSecret: SSO,
    appUrl: 'http://localhost:4000',
    appId: 'figura',
    nowS: () => NOW,
    ...overrides,
  };
}

export async function makeFake(overrides: Partial<FakeConfig> = {}, scenario: Partial<Scenario> = {}) {
  const fake = await buildFakeOrqea(testConfig(overrides), { ...PRESETS.baseline!, ...scenario });
  const call = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fake.app.inject({ method: method as 'GET', url, payload: body as object, headers });
    let json: Record<string, unknown> = {};
    try {
      json = res.json();
    } catch {
      json = {};
    }
    return { status: res.statusCode, json, body: res.body, headers: res.headers };
  };
  const admin = { authorization: `Bearer ${SECRET}` };
  /** Registers, verifies and logs in a user; returns its bearer token. */
  const user = async (email = 'ann@example.com', headers: Record<string, string> = {}) => {
    await call('POST', '/api/auth/register', { email, password: 'Str0ngPassword', acceptedTerms: true }, headers);
    const u = fake.deps.store.userByEmail(email)!;
    u.verified = true;
    const login = await call('POST', '/api/auth/login', { email, password: 'Str0ngPassword' }, headers);
    return { token: login.json.token as string, auth: { authorization: `Bearer ${login.json.token}` }, user: u };
  };
  return { ...fake, call, admin, user };
}
