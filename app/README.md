# app/

Figura's HTTP service: the operator API, single sign-on from the Orqea admin console, sessions, the loopback lock and security headers, and the static UI.

## How it works

`server.ts` builds Fastify with `security.ts` (404 for non-local `Host`, strict CSP with `frame-ancestors`), `auth.ts` (`POST /auth/sso` → single-use JWT check in `sso.ts` → httpOnly session; every `/api` route needs the session, state-changing calls also need `x-figura: 1`) and the routes. `config.ts` reads the environment; `start.ts` migrates and listens; `main.ts` is the one-line entrypoint.

## Sub-folders

- `db/` — Postgres access: migrations, runs queue, events, memory, sessions.
- `routes/` — Runs, reports, calibration and comparison API.
- `test-helpers/` — Test database and in-process app builders (tests only).
