import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { start } from './start.js';
import { TEST_DB_URL } from './test-helpers/db.js';
import { loggerOptions } from './server.js';

describe('app start', () => {
  it('migrates, serves the UI shell and health on loopback', async () => {
    const ui = mkdtempSync(join(tmpdir(), 'ui-'));
    writeFileSync(join(ui, 'index.html'), '<!doctype html><title>Figura</title>');
    const app = await start({
      FIGURA_SESSION_SECRET: 's'.repeat(32),
      FIGURA_SSO_SECRET: 'k'.repeat(32),
      FIGURA_DATABASE_URL: TEST_DB_URL,
      FIGURA_PORT: '0',
      FIGURA_UI_DIR: ui,
    });
    const port = (app.server.address() as { port: number }).port;
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
    expect(await (await fetch(`http://localhost:${port}/`)).text()).toContain('Figura');
    const sso = await fetch(`http://localhost:${port}/auth/sso`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"token":"x"}',
    });
    expect(sso.status).toBe(401);
    await app.close();
  });
  it('logs only method, path and status', () => {
    expect(loggerOptions.serializers.req({ method: 'GET', url: '/a?token=x' })).toEqual({
      method: 'GET',
      path: '/a',
    });
    expect(loggerOptions.serializers.res({ statusCode: 200 })).toEqual({ statusCode: 200 });
  });
});
