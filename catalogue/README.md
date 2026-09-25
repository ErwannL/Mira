# catalogue/

The feature catalogue: one versioned file per Orqea use case.

## How it works

`VERSION` is stamped on every run and report. Each `use-cases/<id>.json` follows `shared/catalogue-schema.ts`: `requires`, `planGate`, `ui` steps written with roles and accessible names (EN/FR, never CSS selectors), `api` steps (method, path, JSON body builder with `{{var}}`), `success` assertions and `frictionHints`. Bump `VERSION` on any change.

## Sub-folders

- `use-cases/` — The 30 use cases.
