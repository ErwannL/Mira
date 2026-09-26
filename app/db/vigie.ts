import { personaSchema, type Persona } from '../../shared/persona-schema.js';
import type { Db } from './pool.js';

/** Stores a Vigie persona set once; a set already stored answers with its original count. */
export async function saveVigieSet(
  db: Db,
  set: { setId: string; sourceEnv: string; targetEnv: string; personas: Persona[] },
): Promise<{ accepted: number; created: boolean }> {
  const client = await db.connect();
  let result: { accepted: number; created: boolean };
  try {
    await client.query('begin');
    const inserted = await client.query(
      `insert into vigie_persona_sets (set_id, source_env, target_env, accepted)
       values ($1, $2, $3, $4) on conflict (set_id) do nothing`,
      [set.setId, set.sourceEnv, set.targetEnv, set.personas.length],
    );
    if (inserted.rowCount === 1) {
      for (const p of set.personas)
        await client.query(
          `insert into vigie_personas (id, set_id, persona) values ($1, $2, $3)
           on conflict (id) do update set set_id = excluded.set_id, persona = excluded.persona, updated_at = now()`,
          [p.id, set.setId, JSON.stringify(p)],
        );
    }
    const { rows } = await client.query<{ accepted: number }>(
      'select accepted from vigie_persona_sets where set_id = $1',
      [set.setId],
    );
    await client.query('commit');
    result = { accepted: rows[0]!.accepted, created: inserted.rowCount === 1 };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  return result;
}

/** The stored Vigie personas, re-validated (a row that no longer fits the schema is skipped). */
export async function vigiePersonas(db: Db): Promise<Persona[]> {
  const { rows } = await db.query<{ persona: unknown }>(
    'select persona from vigie_personas order by id',
  );
  return rows.flatMap((r) => {
    const parsed = personaSchema.safeParse(r.persona);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Catalogue personas first; a stored persona never shadows one of them. */
export async function allPersonas(db: Db, catalogue: Persona[]): Promise<Persona[]> {
  const ids = new Set(catalogue.map((p) => p.id));
  return [...catalogue, ...(await vigiePersonas(db)).filter((p) => !ids.has(p.id))];
}
