# fake-orqea/

The test double of the real Orqea: its routes (`/dashboard`, `/board/:id`, `/settings?tab=…`…), accessible names (from Orqea's locales, en/fr), API paths, payloads and errors, plus docs/ORQEA_CONTRACT.md and configurable friction scenarios. Controls Orqea leaves unnamed are unnamed here too (docs/ORQEA_UI_FACTS.md).

## How it works

`server.ts` wires pages, product API, synthetic admin API, a fake admin console and the browser script. `scenario.ts` defines friction scenarios (presets `baseline`, `improved`, `unclear-signup`, `inaccessible`, `untranslated`, `slow`, `all-unlocked`) selected per run through the signed `X-Synthetic-Run` header and `PUT /__control/scenario/:runId`. `store.ts` is in memory. `start.ts`/`main.ts` start it from the environment.

## Sub-folders

- `api/` — JSON API: auth, boards, board extras, personal, plans, descriptor, synthetic admin.
- `client/` — Browser script (forms as JSON calls, panels, live search, selection count, drag and drop, paywall dialog).
- `pages/` — Server-rendered pages in EN/FR.
- `test-helpers/` — In-process fake builder (tests only).
