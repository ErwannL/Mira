import type { Db } from './pool.js';

export async function saveReport(
  db: Db,
  runId: string,
  kind: string,
  body: unknown,
): Promise<void> {
  await db.query(
    `insert into reports (run_id, kind, body) values ($1, $2, $3) on conflict (run_id, kind) do update set body = excluded.body, created_at = now()`,
    [runId, kind, JSON.stringify(body)],
  );
}

export async function getReport<T>(db: Db, runId: string, kind: string): Promise<T | null> {
  const { rows } = await db.query<{ body: T }>(
    'select body from reports where run_id = $1 and kind = $2',
    [runId, kind],
  );
  return rows[0]?.body ?? null;
}

export async function audit(
  db: Db,
  actor: string,
  action: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await db.query('insert into audit_log (actor, action, detail) values ($1, $2, $3)', [
    actor,
    action,
    detail,
  ]);
}

export async function auditTrail(
  db: Db,
  limit = 100,
): Promise<{ at: Date; actor: string; action: string; detail: Record<string, unknown> }[]> {
  const { rows } = await db.query(
    'select at, actor, action, detail from audit_log order by id desc limit $1',
    [limit],
  );
  return rows;
}

export async function saveCalibration(
  db: Db,
  runId: string,
  actor: string,
  data: unknown,
): Promise<void> {
  await db.query('insert into calibrations (run_id, uploaded_by, data) values ($1, $2, $3)', [
    runId,
    actor,
    JSON.stringify(data),
  ]);
}

/** Remembers a used SSO token hash until it expires; false if it was already used. */
export async function consumeSsoToken(db: Db, hash: string, expiresAt: Date): Promise<boolean> {
  await db.query('delete from used_sso_tokens where expires_at < now()');
  const { rowCount } = await db.query(
    'insert into used_sso_tokens (hash, expires_at) values ($1, $2) on conflict do nothing',
    [hash, expiresAt],
  );
  return rowCount === 1;
}

export async function createSession(
  db: Db,
  idHash: string,
  operator: string,
  expiresAt: Date,
  target: string | null = null,
): Promise<void> {
  await db.query(
    'insert into sessions (id_hash, operator, expires_at, target) values ($1, $2, $3, $4)',
    [idHash, operator, expiresAt, target],
  );
}

export async function findSession(
  db: Db,
  idHash: string,
): Promise<{ operator: string; target: string | null } | null> {
  const { rows } = await db.query<{ operator: string; target: string | null }>(
    'select operator, target from sessions where id_hash = $1 and expires_at > now()',
    [idHash],
  );
  return rows[0] ?? null;
}

export async function deleteSession(db: Db, idHash: string): Promise<void> {
  await db.query('delete from sessions where id_hash = $1 or expires_at < now()', [idHash]);
}
