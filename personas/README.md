# personas/

The persona catalogue: one data file per persona plus its test.

## How it works

Each `<id>.json` follows `shared/persona-schema.ts`. Weights are relative and normalised at load, so persona #11 is one JSON file plus one `<id>.test.ts`, nothing else. Each test pins the traits and at least one behaviour. See docs/PERSONAS.md.

## Sub-folders

- `test-helpers/` — `reaction()` and `money()` helpers used by persona tests.
