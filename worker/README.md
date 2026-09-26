# worker/

The simulation worker: claims queued runs and executes their whole lifecycle.

## How it works

`loop.ts` claims runs (SKIP LOCKED) and recovers runs abandoned by a dead worker. `runner.ts`: preparing (target guard, drift check) → running (simulation) → reporting → cleaning (always) → done/failed/refused/cancelled. `modes.ts` builds journey (browser) or volume (API clones, rate-limited) drivers. `replay.ts` replays a Vigie scenario with one persona and records per-step evidence (docs/VIGIE.md). `build-reports.ts` stores reports. `start.ts`/`main.ts` read the environment.

## Sub-folders

- `engine/` — Journey engine: rounds, sessions, planning, mistakes.
- `friction/` — Friction score, decisions, money (pure, exhaustively tested).
- `drivers/` — Browser (Playwright) and API drivers, in-page measurement.
- `target/` — Orqea contract client, target guard, drift check.
- `reports/` — Deterministic report builders and HTML export.
- `test-helpers/` — Scripted drivers, sample runs, live fake (tests only).
