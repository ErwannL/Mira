# worker/drivers/

How personas act on the target.

## How it works

`browser-driver.ts` (Playwright): roles and accessible names only, persona viewport/locale/time zone, keyboard-only mode, cookie banner by privacy, facts measured in the page by `measure.ts` (self-contained functions injected as text, unit-tested in happy-dom). `api-driver.ts`: catalogue API steps with the signed run header. `limiter.ts`: requests/s cap. `browser.ts`: Chromium launcher.
