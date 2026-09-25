import { join } from 'node:path';
import { createPool, migrate, type Db } from '../db/pool.js';
import { repoRoot } from '../../shared/paths.js';

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://figura:figura@127.0.0.1:5432/figura_test';
export const MIGRATIONS = join(repoRoot(), 'app', 'db', 'migrations');

/** A migrated, emptied test database. */
export async function testDb(): Promise<Db> {
  const db = createPool(TEST_DB_URL);
  await db.query('drop schema public cascade; create schema public;');
  await migrate(db, MIGRATIONS);
  return db;
}
