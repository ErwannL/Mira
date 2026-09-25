# app/routes/

Operator API routes (all behind a session).

## How it works

`runs.ts`: meta, create/list/get/cancel/delete runs, events for the persona inspector. `reports.ts`: report downloads as JSON or self-contained HTML (served with a sandboxing CSP), screenshots, calibration upload and A/B comparison.
