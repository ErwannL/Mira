# app/db/

Postgres persistence shared by the app and the worker.

## How it works

`pool.ts` applies SQL migrations under an advisory lock. `runs.ts` is both the run store and the job queue (`claimNext` uses `SELECT … FOR UPDATE SKIP LOCKED`); every status change goes through `transition()`, which checks the lifecycle and writes one `run_transitions` row. `events.ts` batches journey events, `memory.ts` stores persona memory with credentials encrypted (AES-256-GCM) and never persists session tokens, `misc.ts` holds reports, sessions, used SSO token hashes, audit log and calibrations.

## Sub-folders

- `migrations/` — Ordered SQL files, applied once each.
