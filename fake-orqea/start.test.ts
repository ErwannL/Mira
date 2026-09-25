import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeConfigFromEnv, start } from './start.js';

const env = { SYNTHETIC_SERVICE_SECRET: 's'.repeat(32), FIGURA_SSO_SECRET: 'k'.repeat(32) };
let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

describe('fake orqea start', () => {
  it('reads defaults from the environment', () => {
    const c = fakeConfigFromEnv(env);
    expect(c.config).toMatchObject({ env: 'development', stripeMode: 'test', syntheticEnabled: true, adminAllowed: [], appId: 'figura' });
    expect(c.port).toBe(4100);
    expect(c.host).toBe('127.0.0.1');
    expect(c.scenario.cookieBanner).toBe(true);
    expect(Math.abs(c.config.nowS() - Date.now() / 1000)).toBeLessThan(5);
  });
  it('reads overrides, a scenario preset or file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sc-')), 's.json');
    writeFileSync(file, JSON.stringify({ preset: 'slow', captcha: true }));
    const c = fakeConfigFromEnv({
      ...env, FAKE_ENV: 'staging', FAKE_STRIPE_MODE: 'off', FAKE_SYNTHETIC_ENABLED: 'false', FAKE_ADMIN_ALLOWED: '172.18., 10.0.',
      FAKE_VERSION: 'v2', FAKE_CONSOLE_APP_URL: 'http://a', FIGURA_APP_ID: 'x', FAKE_PORT: '1', FAKE_HOST: '0.0.0.0', FAKE_SCENARIO_FILE: file,
    });
    expect(c.config).toMatchObject({ env: 'staging', stripeMode: 'off', syntheticEnabled: false, adminAllowed: ['172.18.', '10.0.'], version: 'v2', appUrl: 'http://a', appId: 'x' });
    expect(c.scenario).toMatchObject({ slowMs: 4000, captcha: true });
    expect(fakeConfigFromEnv({ ...env, FAKE_SCENARIO: 'improved' }).scenario.cookieBanner).toBe(false);
  });
  it('rejects short secrets and bad stripe modes', () => {
    expect(() => fakeConfigFromEnv({ ...env, SYNTHETIC_SERVICE_SECRET: 'short' })).toThrow('SYNTHETIC_SERVICE_SECRET');
    expect(() => fakeConfigFromEnv({ ...env, FAKE_STRIPE_MODE: 'maybe' })).toThrow('FAKE_STRIPE_MODE');
    expect(() => fakeConfigFromEnv({})).toThrow('SYNTHETIC_SERVICE_SECRET');
  });
  it('listens', async () => {
    const fake = await start({ ...env, FAKE_PORT: '0' });
    close = () => fake.app.close();
    const addr = fake.app.server.address() as { port: number };
    const r = await fetch(`http://127.0.0.1:${addr.port}/health`);
    expect(r.status).toBe(200);
  });
});
