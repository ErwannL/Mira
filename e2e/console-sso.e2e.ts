import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  });
  await app.app.listen({ port: 4198, host: '127.0.0.1' });
  appUrl = 'http://localhost:4198';
  fake = await makeFake({ appUrl, ssoSecret: SSO, nowS: () => Math.floor(Date.now() / 1000) });
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
      .poll(async () => frame.getByRole('heading', { name: 'Runs' }).isVisible())
      .toBe(true);
    const inner = page.frames().find((f) => f.url().startsWith(appUrl))!;
    expect(inner.url()).not.toContain('sso=');
    await page.close();
  });

  it('opened directly without a token: only "open me from the console", never a form', async () => {
    const page = await browser.newPage();
    await page.goto(appUrl);
    await expect
      .poll(async () => page.getByText('Open me from the Orqea admin console.').isVisible())
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
    await expect.poll(async () => page.getByText(/Signed in as/).isVisible()).toBe(true);
    const second = await browser.newPage();
    await second.goto(`${appUrl}/#sso=${token}`);
    await expect
      .poll(async () => second.getByText('Open me from the Orqea admin console.').isVisible())
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
