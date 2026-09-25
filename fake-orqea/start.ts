import { readFileSync } from 'node:fs';
import type { FakeConfig } from './context.js';
import { resolveScenario, type Scenario } from './scenario.js';
import { buildFakeOrqea } from './server.js';

type Env = Record<string, string | undefined>;

function required(env: Env, key: string, minLength = 1): string {
  const v = env[key] ?? '';
  if (v.length < minLength) throw new Error(`${key} must be set (at least ${minLength} characters)`);
  return v;
}

export function fakeConfigFromEnv(env: Env): { config: FakeConfig; scenario: Scenario; port: number; host: string } {
  const stripe = env.FAKE_STRIPE_MODE ?? 'test';
  if (stripe !== 'test' && stripe !== 'live' && stripe !== 'off') throw new Error('FAKE_STRIPE_MODE must be test, live or off');
  const scenarioInput = env.FAKE_SCENARIO_FILE ? JSON.parse(readFileSync(env.FAKE_SCENARIO_FILE, 'utf8')) : (env.FAKE_SCENARIO ?? 'baseline');
  return {
    config: {
      serviceSecret: required(env, 'SYNTHETIC_SERVICE_SECRET', 32),
      env: env.FAKE_ENV ?? 'development',
      stripeMode: stripe,
      syntheticEnabled: env.FAKE_SYNTHETIC_ENABLED !== 'false',
      adminAllowed: (env.FAKE_ADMIN_ALLOWED ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      version: env.FAKE_VERSION ?? 'fake-orqea-1.0.0',
      ssoSecret: required(env, 'FIGURA_SSO_SECRET', 32),
      appUrl: env.FAKE_CONSOLE_APP_URL ?? 'http://localhost:4000',
      appId: env.FIGURA_APP_ID ?? 'figura',
      nowS: () => Math.floor(Date.now() / 1000),
    },
    scenario: resolveScenario(scenarioInput),
    port: Number(env.FAKE_PORT ?? 4100),
    host: env.FAKE_HOST ?? '127.0.0.1',
  };
}

export async function start(env: Env) {
  const { config, scenario, port, host } = fakeConfigFromEnv(env);
  const fake = await buildFakeOrqea(config, scenario);
  await fake.app.listen({ port, host });
  return fake;
}
