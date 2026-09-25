# Coverage

`npm run test:cov` enforces **100 % statements, branches, functions and lines, per file** on
`app/`, `worker/`, `shared/`, `fake-orqea/`, `ui/` (see `vitest.config.ts`). There is no ignore
comment anywhere (`npm run check:tests` rejects them, as well as `.skip/.only`, `__coverage__` and
`expect(true)`-style assertions).

## Excluded files (logic-free only)

| Pattern                                                | Reason                                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `**/*.test.ts`                                         | Tests themselves.                                                                                        |
| `**/test-helpers/**`                                   | Test fixtures and builders, used only by tests.                                                          |
| `**/*.d.ts`                                            | Type declarations.                                                                                       |
| `**/main.ts` (`app/`, `worker/`, `fake-orqea/`, `ui/`) | One-line process entrypoints calling the tested `start()`/`boot()` (worker: plus signal → abort wiring). |

Type-only modules (e.g. `worker/engine/types.ts`, `ui/types.ts`) contain no executable code and
report 0/0, which counts as covered.

## Method

Contributor rule: for each new test, break the code once and watch it go red (mutation spot-check). Browser-side code is tested
twice: directly in happy-dom (coverage) and in real Chromium through the drivers' tests.
