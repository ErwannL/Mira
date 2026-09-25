import type { Db } from './pool.js';
import type { JourneyEvent } from '../../worker/engine/types.js';

export interface StoredEvent extends JourneyEvent {
  seq: number;
}

/** Buffered event writer: one multi-row insert per flush. */
export class EventWriter {
  private buffer: JourneyEvent[] = [];
  private seq = 0;
  constructor(
    private readonly db: Db,
    private readonly runId: string,
    private readonly batchSize = 50,
  ) {}

  async event(e: JourneyEvent): Promise<void> {
    this.buffer.push(e);
    if (this.buffer.length >= this.batchSize) await this.flush();
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    const values: unknown[] = [];
    const rows = batch.map((e, i) => {
      values.push(
        this.runId,
        this.seq + i,
        e.personaId,
        e.kind,
        e.useCaseId,
        e.simTime,
        e.wallTime,
        e,
      );
      const b = i * 8;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`;
    });
    this.seq += batch.length;
    await this.db.query(
      `insert into run_events (run_id, seq, persona_id, kind, use_case_id, sim_time, wall_time, payload) values ${rows.join(', ')}`,
      values,
    );
  }
}

export async function eventsOf(
  db: Db,
  runId: string,
  personaId: string | null = null,
): Promise<StoredEvent[]> {
  const { rows } = await db.query<{ seq: number; payload: JourneyEvent }>(
    `select seq, payload from run_events where run_id = $1 and ($2::text is null or persona_id = $2) order by seq`,
    [runId, personaId],
  );
  return rows.map((r) => ({ ...r.payload, seq: r.seq }));
}
