# Decisions

Each entry: decision — why. Ambiguities were resolved towards the safer option.

## Identity

- **Name "Figura"** — a figure/persona, a figure on stage rehearsing, a crowd of figures; readable in
  English and French, reads well as "Figura by Orqea". Teal `#3dd6c6` (10.5:1 on `#0f1115`), no violet.
- **One logo mark** — it carries its own dark tile, so it works on dark and light backgrounds; no
  separate `logo-dark`/`logo-light` needed.

## Stack

- **TypeScript everywhere, one package** — shared schemas/i18n between app, worker, UI and fake with
  no workspace tooling; one tsconfig, one lint and one coverage configuration.
- **Fastify** (app and fake), **Playwright** (browser driver: roles, accessible names, screenshots),
  **Postgres** with a `SELECT … FOR UPDATE SKIP LOCKED` queue (no Redis), **zod** for data files.
- **UI without a framework** (Vite + a 20-line element builder, never `innerHTML`) — small bundle,
  easy to test at 100 % in happy-dom, strict CSP (`script-src 'self'`) with no inline code.
- **Vitest + @vitest/coverage-v8**, thresholds 100 per file (`perFile: true`).
- **Minimal HS256 JWT in `shared/jwt.ts`** instead of a dependency — only HS256 is accepted, `alg` is
  checked, comparison is constant-time.

## Model

- **Friction score = clamped sum of weighted facts** modulated by traits; frustration decays per
  step and between sessions — explainable: every reason has a code and value in the inspector.
- **Abandon threshold = 0.25 + 0.8 × frictionTolerance** (weights file) — a persona abandons when
  accumulated frustration reaches it; a failed critical step (acquisition) that the persona does
  not retry is an abandon, a failed optional step is a skip.
- **Hard block**: a screen-reader persona abandons when a control it needs has no accessible name.
- **Extension to the persona model: `assistive {screenReader, keyboardOnly}`** — persona 10 needs it;
  keyboard-only personas act with Enter/Space and cannot drag and drop.
- **Population weights are relative**, normalised at load and again for the personas selected in a
  run — so persona #11 is one file + one test, and a subset run still models a whole population.
- **Money**: cheapest plan unlocking the need; `stretch = budget × (1 + 0.5 × (1 − priceSensitivity))`;
  `perceivedValue = need × (0.5 + 0.3 × satisfaction + 0.2 × urgency)`. Prices always come from the
  target's plan list. A conversion is **recorded only** unless the run enables checkout _and_ the
  target reports `stripeMode:"test"` (otherwise it is silently downgraded to recorded-only).
- **Pricing-page visits** record a decision but never end the journey; a paywall `churn` does.
- **Mistakes** (typo in email, weak password, forgotten terms) happen with probability
  `errorProneness × 0.5` each; after an error page a mistake is fixed if the message is clear,
  otherwise only with probability `techSavvy`.
- **Message clarity heuristic**: shorter than 15 characters or a generic "Error/Invalid/Something
  went wrong" is unclear.
- **Untranslated UI**: the persona still finds the control by its other-language name (it is the
  same control) but the step gets the `foreign-language` friction.
- **Determinism**: every decision uses `fork(label)` streams derived from the run seed (independent
  of iteration order). Real timings are recorded next to decisions but never feed them, except
  `timeToInteractiveMs`, which is a measured fact (a slower target is a different target).
- **Passwords are random (`crypto`), never derived from the seed** — the seed is stored on the run.

## Runs

- **Refused runs never call the target** (not even cleanup): the target may be production.
- **Unknown `env` counts as production** — only an explicit allow-list of non-production values passes.
- **Drift fails the run** (`CATALOGUE_DRIFT`) before any account is created.
- **Cancelled runs skip reporting** but still clean up; a worker that dies leaves a run that the
  next worker marks failed after a best-effort cleanup (heartbeat older than 10 min).
- **Session tokens and verification links are never persisted** in persona memory; credentials are
  encrypted with AES-256-GCM (key derived from `FIGURA_DATA_KEY` via scrypt).
- **Volume mode** clones `max(1, round(weight × targetUsers))` accounts per persona and shares one
  token bucket (`FIGURA_MAX_RPS`). The rows estimate for `VOLUME_CAP` is 50 rows per account.

## Security

- **Loopback lock answers 404** (the tool "does not exist" from elsewhere), including on `/health`.
- **Anti-CSRF**: `SameSite=Strict` cookie plus a required `x-figura: 1` header on state-changing
  calls (a custom header cannot be sent cross-origin without CORS, which is never enabled).
- **Static UI shell is served without a session** — it holds no data; without a session it only
  shows "open me from the Orqea admin console". Only `/auth/sso` and `/health` are open API routes.
- **Exported HTML reports** are served with `default-src 'none'; …; sandbox` and are self-contained
  (inline CSS, screenshots as data URIs, no script).
- **Logs** carry method, path (no query) and status only.

## Fake Orqea

- **Forms are submitted as JSON calls by a small browser script** (SPA-like) so that 402 paywalls,
  error messages and tokens behave like a real client.
- **Admin API reachable from `FAKE_ADMIN_ALLOWED` prefixes** — in compose the worker is another
  container, not loopback; the real contract names this `SYNTHETIC_ADMIN_SOURCES`.
- **Catalogue password fields use the pseudo-role `password`**, resolved by accessible name
  restricted to password inputs (password inputs have no ARIA role).

## Quality

- **Self-contained in-page code** (`measure.ts`, fake client script) is written as plain exported
  functions, tested directly in happy-dom and serialised with `Function.prototype.toString` for the
  browser — no coverage exclusion needed.
- **Entrypoints `*/main.ts` are one-line calls** to tested `start()` functions and are the only
  source files excluded from coverage (see COVERAGE.md).
