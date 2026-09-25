# Architecture

```
 Orqea admin console ──iframe #sso=<JWT>──▶  app (Fastify, :4000, loopback only)
                                              │  UI (dist/ui), /auth/sso, /api/*
                                              ▼
                                         Postgres (runs = queue, events, memory, reports)
                                              ▲
                                  worker ─────┘  claims runs (SKIP LOCKED)
                                    │   guard → drift → simulate → reports → cleanup
                                    ├── Chromium (journey mode, one context per persona session)
                                    └── HTTP (volume mode, rate-limited)
                                    ▼
                         target: fake-orqea (:4100, default) or a non-production Orqea
```

## Data flow of a run

1. **Operator** (signed in via SSO) posts a run config → row `draft` → `queued` (audited).
2. **Worker** claims it (`preparing`), builds an `OrqeaClient`, runs the **guard**
   (`worker/target/guard.ts`); a refusal ends the run (`refused`, code + sentence) without touching
   the target. The **drift check** compares catalogue API steps with `GET /api`.
3. `running`: `simulate()` walks rounds of simulated time; each active persona lives a session in a
   fresh browser context (journey) or API client (volume). Steps produce **facts** → `frictionOf`
   → frustration → `decide()`; paywalls → `decideMoney()`. Events are written in batches; persona
   memory (credentials encrypted) is saved after each session. A background poll reads the cancel
   flag and writes a heartbeat.
4. `reporting`: funnel, load, pricing reports built from persisted events and memories.
5. `cleaning` (always, in `finally`): `POST /api/admin/synthetic/cleanup`; residual rows ⇒ `failed`.
6. `done | failed | cancelled`. A/B comparisons and calibrations are computed on demand from stored
   funnel reports.

## Determinism

`seed` is stored per run; each persona has `createPrng(seed).fork(personaId)`, then forks per round,
session and use case. Same seed + same target build + same catalogue ⇒ same decisions (tested in
`worker/runner.test.ts` against the live fake and Chromium). Wall-clock timings are recorded
alongside and shown, never hidden.

## Modules

See each folder's README. Pure core: `worker/friction`, `worker/engine`, `worker/reports`, `shared`.
Adapters: `worker/drivers` (Playwright/HTTP), `worker/target` (contract), `app/db` (Postgres).
