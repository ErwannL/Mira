# catalogue/

The feature catalogue: one versioned file per Orqea use case.

## How it works

`VERSION` is stamped on every run and report. Each `use-cases/<id>.json` follows `shared/catalogue-schema.ts`: `requires`, `planGate` (`free` or an Orqea feature key: `qrCodes`, `advancedAnalytics`), `ui` steps written with the real Orqea's routes, roles and accessible names (EN/FR from its locales, never CSS selectors; `expectText` only for outcomes Orqea shows without a name), `api` steps (Orqea's real paths and bodies, JSON body builder with `{{var}}`, `save` of captured ids), `success` assertions and `frictionHints`. Known gaps of Orqea's UI are in docs/ORQEA_UI_FACTS.md. Bump `VERSION` on any change (`cat-2.0.0`: rewritten for the real Orqea).

## Sub-folders

- `use-cases/` — The 31 use cases.
