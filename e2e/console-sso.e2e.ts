import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** CI runners can take longer than vitest's 1 s default to boot the SPA and sign in. */
const SLOW = { timeout: 15_000 };
import { chromium, type Browser } from 'playwright';
import { join } from 'node:path';
import { makeApp, SSO } from '../app/test-helpers/app.js';
import { makeFake } from '../fake-orqea/test-helpers/fake.js';
import { repoRoot } from '../shared/paths.js';

let browser: Browser;
let app: Awaited<ReturnType<typeof makeApp>>;
let fake: Awaited<ReturnType<typeof makeFake>>;
let appUrl = '';
let consoleUrl = '';

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  app = await makeApp({
    uiDir: join(repoRoot(), 'dist', 'ui'),
    consoleOrigins: ['http://localhost:4199'],
    targets: { local: { api: 'http://localhost:4199', web: 'http://localhost:4199', rewrite: {} } },
  });
  await app.app.listen({ port: 4198, host: '127.0.0.1' });
  appUrl = 'http://localhost:4198';
  // Like Orqea's console: the handoff token names the environment it inspects.
  fake = await makeFake({
    appUrl,
    ssoSecret: SSO,
    consoleTarget: 'local',
    nowS: () => Math.floor(Date.now() / 1000),
  });
  await fake.app.listen({ port: 4199, host: '127.0.0.1' });
  consoleUrl = 'http://localhost:4199/console';
});
afterAll(async () => {
  await browser.close();
  await fake.app.close();
  await app.close();
});

describe('admin console embedding (e2e)', () => {
  it('the fake console embeds the app, SSO signs the operator in and the fragment disappears', async () => {
    const page = await browser.newPage();
    await page.goto(consoleUrl);
    const frame = page.frameLocator('iframe[title="Synthetic users simulator"]');
    await expect
      .poll(async () => frame.getByText('Signed in as Fake console operator').isVisible(), {
        timeout: 15_000,
      })
      .toBe(true);
    await expect
      .poll(async () => frame.getByRole('heading', { name: 'Runs' }).isVisible(), SLOW)
      .toBe(true);
    const inner = page.frames().find((f) => f.url().startsWith(appUrl))!;
    expect(inner.url()).not.toContain('sso=');
    // The Orqea the console inspects is preselected for new runs.
    await inner.goto(`${appUrl}/#/new`);
    await expect
      .poll(async () => frame.getByText('Testing Orqea “local”').isVisible(), SLOW)
      .toBe(true);
    expect(await frame.getByRole('combobox', { name: 'Orqea to test' }).inputValue()).toBe('local');
    await page.close();
  });

  it('opened directly without a token: only "open me from the console", never a form', async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await expect
      .poll(async () => page.getByText('Open me from the Orqea admin console.').isVisible(), SLOW)
      .toBe(true);
    expect(await page.locator('form, input').count()).toBe(0);
    await page.close();
  });

  it('a reused token is refused', async () => {
    const page = await browser.newPage();
    const { token } = (await (await fetch('http://localhost:4199/console/token')).json()) as {
      token: string;
    };
    await page.goto(`${appUrl}/#sso=${token}`);
    await expect.poll(async () => page.getByText(/Signed in as/).isVisible(), SLOW).toBe(true);
    const second = await browser.newPage();
    await second.goto(`${appUrl}/#sso=${token}`);
    await expect
      .poll(async () => second.getByText('Open me from the Orqea admin console.').isVisible(), SLOW)
      .toBe(true);
    await page.close();
    await second.close();
  });

  it('the app refuses to be framed by anyone but the console (CSP frame-ancestors)', async () => {
    const res = await fetch(`${appUrl}/`);
    expect(res.headers.get('content-security-policy')).toContain(
      'frame-ancestors http://localhost:4199',
    );
  });
});
