# app/routes/

Operator API routes (behind a session), plus Vigie's service API (Bearer `FIGURA_VIGIE_SECRET`, docs/VIGIE.md).

## How it works

`runs.ts`: meta, create/list/get/cancel/delete runs, events for the persona inspector. `reports.ts`: report downloads as JSON or self-contained HTML (served with a sandboxing CSP), screenshots, calibration upload and A/B comparison. `vigie.ts`: replays (Vigie scenario → `replay` run), their state and evidence, persona sets.
