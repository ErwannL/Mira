import { chromium, type Browser } from 'playwright';

/** One headless Chromium per run; each persona session gets its own context. */
export async function launchBrowser(executablePath: string | undefined): Promise<Browser> {
  return chromium.launch({ headless: true, executablePath: executablePath || undefined });
}
