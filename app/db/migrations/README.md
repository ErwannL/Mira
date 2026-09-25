# app/db/migrations/

Ordered SQL migrations (`NNN_name.sql`).

## How it works

Applied in name order by `migrate()`, each in a transaction, recorded in `schema_migrations`. Never edit an applied file: add a new one.
