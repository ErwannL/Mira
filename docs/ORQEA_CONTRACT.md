# Orqea ⇄ Figura contract

What Orqea must provide so Figura (the synthetic-user simulator) can run against it, and what the
admin console must do to embed Figura. The fake Orqea (`fake-orqea/`) implements every server-side
item below and is the reference implementation; `worker/target/client.ts` is the client.

Conventions: JSON bodies (`content-type: application/json`), UTF-8, times in seconds since epoch.
Figura sends `accept-language: en|fr` (the persona's language) on product calls.

## 1. Environment variables (Orqea side)

| Variable                                                      | Where         | Meaning                                                                                                                            |
| ------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `SYNTHETIC_MODE` (`true`/`false`)                             | API           | Enables the synthetic admin API and the run header. Default `false`. **Must be `false` in production.**                            |
| `SYNTHETIC_SERVICE_SECRET` (≥ 32 chars)                       | API           | Shared with Figura: Bearer secret of the admin API and HMAC key of `X-Synthetic-Run`.                                              |
| `SYNTHETIC_ADMIN_SOURCES`                                     | API           | Source addresses allowed on the admin API besides loopback (e.g. the Figura worker's network). Default: loopback only.             |
| `APP_ENV`                                                     | API           | Reported as `env` (§3.1). Anything but an explicit non-production value is treated as production by Figura.                        |
| `FIGURA_SSO_SECRET` (≥ 32 chars, ≠ Figura's session secret)   | Admin console | Signs SSO tokens (§5).                                                                                                             |
| `FIGURA_APP_ID` (default `figura`)                            | Admin console | JWT audience.                                                                                                                      |
| `FIGURA_URL_LOCAL` / `FIGURA_URL_STAGING` / `FIGURA_URL_PROD` | Admin console | Figura's URL per environment (the prod console may point at a Figura that only targets staging — Figura never targets production). |

## 2. Public product API (normal user endpoints)

| Endpoint                                                               | Success                                                                                               | Errors                                                                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register {email, password, username?, acceptedTerms?}` | `201 {id, email, username}`                                                                           | `400 {error, message}` with a human explanation (Figura measures its clarity); `409 {error:"EMAIL_EXISTS", message}` |
| `GET /api/auth/verify-email?token=…`                                   | the page the verification link opens: `200` HTML when `accept: text/html`, else `200 {verified:true}` | `400` invalid/expired token                                                                                          |
| `POST /api/auth/login {email, password}`                               | `200 {token}` (Bearer for later calls)                                                                | `403` email not verified; `401` otherwise; `429` login brake                                                         |
| `GET /api`                                                             | `200 {endpoints:[{method, path, …}]}` — every API route, path params as `:name`                       | —                                                                                                                    |
| `GET /api/billing/plans` (public)                                      | `200 {plans:[{key, name, priceMonthly, currency, perSeat, features:[featureKey…]}]}`                  | —                                                                                                                    |

Plus the product endpoints used by the catalogue's `api` steps (`catalogue/use-cases/*.json`;
the drift check lists them). Authenticated calls use `Authorization: Bearer <token>`.

**Paywall.** A locked feature answers **402** `{code:"FEATURE_LOCKED"|"PLAN_LIMIT", feature?, limitKey?, planKey, upgrade:true}`.
Figura treats it as a paywall encounter (money decision), not as a bug. In the web UI the same
402 JSON must be what the page's own call receives (Figura's browser driver reads 402 responses).

**UI.** Controls must expose roles and accessible names; the catalogue's `ui` steps use them
(e.g. button "Create account" / "Créer mon compte"). A changed name is a catalogue change.

## 3. Synthetic-users admin API

Enabled only when `SYNTHETIC_MODE=true` **and** the environment is not production. Otherwise, and
for any source not on loopback / `SYNTHETIC_ADMIN_SOURCES`, every admin route answers **404**.
Authentication: `Authorization: Bearer <SYNTHETIC_SERVICE_SECRET>` (constant-time compare) → `401` otherwise.

### 3.1 `GET /api/admin/synthetic/target`

`200 {env, stripeMode:"test"|"live"|"off", syntheticEnabled, version}`.
Figura accepts only `env` ∈ `dev, development, local, test, testing, ci, staging, preview, qa, synthetic`
(case-insensitive); anything else ⇒ `PRODUCTION_ENV`.

### 3.2 `POST /api/admin/synthetic/verification {email, runId}`

For an **unverified** account of that run: `200 {verifyUrl}` (the same link an email would contain;
Figura opens it in the persona's browser, so the verify page is exercised). `404` otherwise.

### 3.3 Synthetic accounts

Emails: `synth+<runId>-<personaId>[-<n>]@synthetic.invalid`; `runId` is base-36 (`[0-9a-z]+`).
They must be **excluded from product analytics** (events, funnels, MRR, emails): filter on the
`@synthetic.invalid` domain at ingestion. `.invalid` never receives mail (RFC 2606).

### 3.4 `X-Synthetic-Run: <runId>.<ts>.<hex HMAC-SHA256(SYNTHETIC_SERVICE_SECRET, "<runId>|<ts>")>`

Valid when `|now − ts| ≤ 300 s` and the HMAC matches. Such requests are exempt from rate limits,
login brakes and captcha. When a real user **would** have seen a captcha, answer with
`X-Captcha-Would-Show: 1` (Figura counts it as friction). Figura refreshes the header on every step.

### 3.5 `POST /api/admin/synthetic/cleanup {runId} | {olderThanHours}`

Deletes every synthetic account of the run (or older than N hours) and everything they own.
`200 {before, after, residualRows}` — row counts before/after and synthetic rows still matching.
Figura fails the run when `residualRows > 0`. `400` without a valid selector.

## 4. Guard (Figura side, before any work) — refusal codes shown verbatim in the UI

| Code                                   | When                                                                                                                              | Override             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `PRODUCTION_ENV`                       | host listed in `FIGURA_PRODUCTION_HOSTS`, or `env` not explicitly non-production                                                  | **none**             |
| `REMOTE_HOST_UNCONFIRMED`              | host not loopback/declared-local, unless the run has `allowRemote` **and** the host retyped (`confirmHost`, compared server-side) | per run              |
| `SYNTHETIC_DISABLED`                   | `syntheticEnabled:false`                                                                                                          | enable on the target |
| `VOLUME_CAP`                           | accounts / requests per second / estimated rows above `FIGURA_MAX_*`                                                              | lower the run        |
| `ORQEA_CONTRACT_MISSING:<METHOD path>` | a §2/§3 endpoint missing or malformed                                                                                             | implement it         |

A refused run never touches the target (no cleanup call either). A catalogue step absent from
`GET /api` fails the run with `CATALOGUE_DRIFT: …` before anything is created.

## 5. Admin console embedding and single sign-on

**Token endpoint (console backend):** admin-only, reachable from localhost/the console only,
e.g. `GET /admin/figura/token` → `{token, expiresIn: 60}` where `token` is a JWT HS256 signed with
`FIGURA_SSO_SECRET`: header `{alg:"HS256",typ:"JWT"}`, claims
`{iss:"orqea-admin-console", aud:"<FIGURA_APP_ID>", operator:"<display name>", iat, exp: iat+60}`.
`operator` is for Figura's audit log only (no account is provisioned).

**Iframe:** `<iframe title="Synthetic users simulator" src="<FIGURA_URL>/#sso=<token>">`. The
fragment never reaches servers or logs. If no `load` event within 8 s, show a fallback link.
Offer "Open in new tab" that fetches a **fresh** token (tokens are single use).

**Figura side:** reads `#sso=` once, `POST /auth/sso {token}`, then `history.replaceState` removes
the fragment. It verifies signature, `iss`, `aud`, `exp` (lifetime ≤ 60 s) and single use (SHA-256
kept until expiry), then sets its own session cookie (httpOnly, `SameSite=Strict`; with
`FIGURA_COOKIE_CROSS_SITE=true` → `SameSite=None; Secure` for a console on another site — HTTPS required).
Errors: `400 TOKEN_REQUIRED`, `401 {error: MALFORMED|BAD_ALG|BAD_SIGNATURE|BAD_ISSUER|BAD_AUDIENCE|EXPIRED|BAD_LIFETIME|NO_OPERATOR|REUSED}`.
Only `/auth/sso`, `/health` and the static UI shell are reachable without a session; the shell only
says "open me from the Orqea admin console".

**Framing:** Figura sends `Content-Security-Policy: frame-ancestors <FIGURA_CONSOLE_ORIGINS>` and no
`X-Frame-Options`. Put the console origin(s) of each environment in `FIGURA_CONSOLE_ORIGINS`.

**Loopback lock:** Figura answers **404** to any request whose `Host` is not local. Set
`FIGURA_LOOPBACK_ONLY=false` only behind a reverse proxy that authenticates admins itself.

## 6. Fake-only extension

`PUT /__control/scenario/:runId {preset?, …overrides}` (same auth as §3) selects a friction
scenario for one run. Orqea does not need it; Figura calls it only when a run sets `fakeScenario`.
