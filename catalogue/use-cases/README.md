# catalogue/use-cases/

One JSON file per use case, named after its id.

## How it works

Validated at load time (unknown requirements and cycles are rejected). The drift check compares every `api` step with the target's `GET /api`.
