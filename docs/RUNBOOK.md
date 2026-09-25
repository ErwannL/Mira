# Runbook

## Start locally

```sh
cp .env.example .env        # then replace every change-me value (openssl rand -base64 36)
docker compose up --build   # db, app :4000, worker, fake-orqea :4100 (127.0.0.1 only)
open http://localhost:4100/console      # fake admin console embedding Figura with SSO
# or, without the console:
npm ci && npm run sso:mint              # prints http://localhost:4000/#sso=<60 s token>
```

## A first run

New run → mode _Journey_, target `http://fake-orqea:4100`, scenario `unclear-signup`, seed `42`.
Queue a second run with the same seed and scenario `baseline`, then _Compare_ both.

## Develop

```sh
npm ci                      # installs the pre-commit hook (npm run check)
createdb figura_test        # or set TEST_DATABASE_URL
npm run test:cov            # 100 % per file
npm run build && npm run e2e
npm run brand               # after editing brand/*.svg
```

## Operate

- **Refused run**: read the code + sentence on the run page (ORQEA_CONTRACT.md §4).
- **`CATALOGUE_DRIFT`**: the target changed an endpoint; update `catalogue/use-cases/*.json` and bump `catalogue/VERSION`.
- **`CLEANUP_INCOMPLETE` / `CLEANUP_FAILED`**: call `POST /api/admin/synthetic/cleanup {runId}` on the
  target again, or `{olderThanHours: 24}` for orphans.
- **Stuck run**: a new worker fails runs without heartbeat for 10 min and attempts cleanup.
- **Purge**: delete a finished run in the UI (removes events, memory, reports, screenshots).
- **Tuning**: edit `config/friction-weights.json`, bump its `version`; the golden funnel report
  (`worker/reports/golden/funnel.json`) must be regenerated deliberately (`UPDATE_GOLDEN=1`).
