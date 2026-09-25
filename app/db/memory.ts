import type { Db } from './pool.js';
import { decrypt, encrypt } from '../../shared/crypto.js';
import type { Credentials, Memory, MemoryStore } from '../../worker/engine/types.js';

/** Persona memory per run; synthetic credentials are encrypted at rest (AES-256-GCM). */
export class DbMemoryStore implements MemoryStore {
  constructor(private readonly db: Db, private readonly runId: string, private readonly key: Buffer) {}

  async load(personaId: string): Promise<{ memory: Memory; credentials: Credentials | null } | null> {
    const { rows } = await this.db.query<{ memory: Memory; credentials_enc: string | null }>(
      'select memory, credentials_enc from persona_memory where run_id = $1 and persona_id = $2',
      [this.runId, personaId],
    );
    const row = rows[0];
    if (!row) return null;
    const credentials = row.credentials_enc ? (JSON.parse(decrypt(row.credentials_enc, this.key)) as Credentials) : null;
    return { memory: row.memory, credentials };
  }

  async save(memory: Memory, credentials: Credentials | null): Promise<void> {
    const enc = credentials ? encrypt(JSON.stringify(credentials), this.key) : null;
    // Session tokens and verification links are never persisted (a new session logs in again).
    const { token: _t, verifyUrl: _u, verifyToken: _v, ...vars } = memory.vars;
    memory = { ...memory, vars };
    await this.db.query(
      `insert into persona_memory (run_id, persona_id, memory, credentials_enc) values ($1, $2, $3, $4)
       on conflict (run_id, persona_id) do update set memory = excluded.memory, credentials_enc = excluded.credentials_enc, updated_at = now()`,
      [this.runId, memory.personaId, memory, enc],
    );
  }
}

export async function memoriesOf(db: Db, runId: string): Promise<Memory[]> {
  const { rows } = await db.query<{ memory: Memory }>('select memory from persona_memory where run_id = $1 order by persona_id', [runId]);
  return rows.map((r) => r.memory);
}
