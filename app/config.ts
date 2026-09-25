type Env = Record<string, string | undefined>;

export interface AppConfig {
  databaseUrl: string;
  sessionSecret: string;
  ssoSecret: string;
  appId: string;
  consoleOrigins: string[];
  loopbackOnly: boolean;
  crossSiteCookie: boolean;
  sessionTtlMinutes: number;
  port: number;
  host: string;
  screenshotsDir: string;
  uiDir: string;
  maxRunsListed: number;
}

function secret(env: Env, key: string): string {
  const v = env[key] ?? '';
  if (v.length < 32) throw new Error(`${key} must be set to at least 32 characters`);
  return v;
}

export function appConfigFromEnv(env: Env, defaults: { uiDir: string }): AppConfig {
  const sessionSecret = secret(env, 'FIGURA_SESSION_SECRET');
  const ssoSecret = secret(env, 'FIGURA_SSO_SECRET');
  if (sessionSecret === ssoSecret) throw new Error('FIGURA_SSO_SECRET must differ from FIGURA_SESSION_SECRET');
  const databaseUrl = env.FIGURA_DATABASE_URL ?? '';
  if (!databaseUrl) throw new Error('FIGURA_DATABASE_URL must be set');
  const origins = (env.FIGURA_CONSOLE_ORIGINS ?? 'http://localhost:4100').split(',').map((s) => s.trim()).filter(Boolean);
  for (const o of origins) {
    if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)) throw new Error(`FIGURA_CONSOLE_ORIGINS: invalid origin ${o}`);
  }
  return {
    databaseUrl,
    sessionSecret,
    ssoSecret,
    appId: env.FIGURA_APP_ID ?? 'figura',
    consoleOrigins: origins,
    loopbackOnly: env.FIGURA_LOOPBACK_ONLY !== 'false',
    crossSiteCookie: env.FIGURA_COOKIE_CROSS_SITE === 'true',
    sessionTtlMinutes: Number(env.FIGURA_SESSION_TTL_MIN ?? 120),
    port: Number(env.FIGURA_PORT ?? 4000),
    host: env.FIGURA_HOST ?? '127.0.0.1',
    screenshotsDir: env.FIGURA_SCREENSHOTS_DIR ?? 'data/screenshots',
    uiDir: env.FIGURA_UI_DIR ?? defaults.uiDir,
    maxRunsListed: 200,
  };
}
