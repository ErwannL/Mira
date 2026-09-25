import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Db = pg.Pool;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10 });
}

/** Applies pending migrations in order, each in its own transaction, under an advisory lock. */
export async function migrate(db: Db, dir: string): Promise<string[]> {
  const client = await db.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock(424242)');
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue;
      await client.query('begin');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [file]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw e;
      }
      applied.push(file);
    }
  } finally {
    await client.query('select pg_advisory_unlock(424242)');
    client.release();
  }
  return applied;
}
