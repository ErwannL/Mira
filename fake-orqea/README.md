# fake-orqea/

A small fake Orqea: the default target, implementing docs/ORQEA_CONTRACT.md plus every catalogue step, with configurable friction scenarios.

## How it works

`server.ts` wires pages, product API, synthetic admin API, a fake admin console and the browser script. `scenario.ts` defines friction scenarios (presets `baseline`, `improved`, `unclear-signup`, `inaccessible`, `untranslated`, `slow`, `all-unlocked`) selected per run through the signed `X-Synthetic-Run` header and `PUT /__control/scenario/:runId`. `store.ts` is in memory. `start.ts`/`main.ts` start it from the environment.

## Sub-folders

- `api/` — JSON API: auth, product, plans, synthetic admin.
- `client/` — Browser script (forms as JSON calls, drag and drop, paywall dialog).
- `pages/` — Server-rendered pages in EN/FR.
- `test-helpers/` — In-process fake builder (tests only).
