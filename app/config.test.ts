import { describe, expect, it } from 'vitest';
import { appConfigFromEnv } from './config.js';

const env = {
  FIGURA_SESSION_SECRET: 's'.repeat(32),
  FIGURA_SSO_SECRET: 'k'.repeat(32),
  FIGURA_DATABASE_URL: 'postgres://x',
};
describe('app config', () => {
  it('safe defaults', () => {
    expect(appConfigFromEnv(env, { uiDir: '/ui' })).toMatchObject({
      loopbackOnly: true,
      crossSiteCookie: false,
      host: '127.0.0.1',
      port: 4000,
      appId: 'figura',
      consoleOrigins: ['http://localhost:4100'],
      uiDir: '/ui',
      sessionTtlMinutes: 120,
    });
  });
  it('overrides', () => {
    const c = appConfigFromEnv(
      {
        ...env,
        FIGURA_LOOPBACK_ONLY: 'false',
        FIGURA_COOKIE_CROSS_SITE: 'true',
        FIGURA_CONSOLE_ORIGINS: 'https://a.b, http://c:1',
        FIGURA_APP_ID: 'x',
        FIGURA_SESSION_TTL_MIN: '5',
        FIGURA_PORT: '1',
        FIGURA_HOST: '0.0.0.0',
        FIGURA_SCREENSHOTS_DIR: '/s',
        FIGURA_UI_DIR: '/u',
      },
      { uiDir: '/ui' },
    );
    expect(c).toMatchObject({
      loopbackOnly: false,
      crossSiteCookie: true,
      consoleOrigins: ['https://a.b', 'http://c:1'],
      appId: 'x',
      sessionTtlMinutes: 5,
      port: 1,
      host: '0.0.0.0',
      screenshotsDir: '/s',
      uiDir: '/u',
    });
  });
  it('rejects weak, shared or missing secrets and bad origins', () => {
    expect(() => appConfigFromEnv({ ...env, FIGURA_SSO_SECRET: 'x' }, { uiDir: '' })).toThrow(
      'FIGURA_SSO_SECRET',
    );
    expect(() =>
      appConfigFromEnv({ ...env, FIGURA_SSO_SECRET: env.FIGURA_SESSION_SECRET }, { uiDir: '' }),
    ).toThrow('must differ');
    expect(() => appConfigFromEnv({ ...env, FIGURA_DATABASE_URL: '' }, { uiDir: '' })).toThrow(
      'DATABASE_URL',
    );
    expect(() =>
      appConfigFromEnv(
        {
          FIGURA_SESSION_SECRET: env.FIGURA_SESSION_SECRET,
          FIGURA_SSO_SECRET: env.FIGURA_SSO_SECRET,
        },
        { uiDir: '' },
      ),
    ).toThrow('DATABASE_URL');
    expect(() =>
      appConfigFromEnv({ ...env, FIGURA_CONSOLE_ORIGINS: "* 'unsafe'" }, { uiDir: '' }),
    ).toThrow('invalid origin');
    expect(() => appConfigFromEnv({}, { uiDir: '' })).toThrow('FIGURA_SESSION_SECRET');
  });
});
