# worker/target/

The client side of the Orqea contract.

## How it works

`client.ts` calls the endpoints of docs/ORQEA_CONTRACT.md and walks Orqea's nested `GET /api` descriptor (`flattenEndpoints`). `guard.ts` refuses before any work (`PRODUCTION_ENV` — no bypass, `recette` is allowed —, `REMOTE_HOST_UNCONFIRMED` for any host the run reaches, `SYNTHETIC_DISABLED`, `VOLUME_CAP`, `ORQEA_CONTRACT_MISSING:<endpoint>`, `TARGET_NOT_CONFIGURED`) and returns the parsed plans. `drift.ts` compares catalogue API steps with `GET /api`; the runner reports drift in the run summary, it never fails the run.
