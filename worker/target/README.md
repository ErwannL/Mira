# worker/target/

The client side of the Orqea contract.

## How it works

`client.ts` calls the endpoints of docs/ORQEA_CONTRACT.md. `guard.ts` refuses before any work (`PRODUCTION_ENV` — no bypass —, `REMOTE_HOST_UNCONFIRMED`, `SYNTHETIC_DISABLED`, `VOLUME_CAP`, `ORQEA_CONTRACT_MISSING:<endpoint>`). `drift.ts` compares catalogue API steps with `GET /api`.
