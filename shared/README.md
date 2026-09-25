# shared/

Code shared by the app, the worker, the UI and the fake: schemas, loaders, seeded PRNG, crypto, JWT, synthetic-run signing, i18n.

## How it works

Pure modules with no service dependency.

## Sub-folders

- `test-helpers/` — Fixtures loading the real personas/catalogue/config (tests only).
