import type { Persona, TimeConfig } from '../../shared/persona-schema.js';
import type { JourneyEvent } from '../engine/types.js';
import { key } from '../target/drift.js';
import { quantile, round4 } from './stats.js';
import type { ReportMeta } from './meta.js';

/** Assumed stored size of one created object — documented in docs/FRICTION_MODEL.md. */
export const BYTES_PER_OBJECT = 1024;

export interface LoadReport {
  type: 'load';
  meta: ReportMeta;
  assumptions: { bytesPerObject: number; peakMultiplier: number };
  scenarios: {
    users: number;
    endpoints: { endpoint: string; requestsPerWeek: number; peakRequestsPerSecond: number }[];
    objectsPerWeek: number;
    storageGrowthBytesPerWeek: number;
  }[];
  measuredLatency: { endpoint: string; count: number; p50: number | null; p95: number | null; p99: number | null }[];
}

/** Clone ids in volume mode are "<personaId>-c<n>"; journey ids are the persona id. */
export const basePersonaId = (id: string): string => id.replace(/-c\d+$/, '');

export function buildLoad(meta: ReportMeta, personas: Persona[], events: JourneyEvent[], time: TimeConfig, userScenarios: number[]): LoadReport {
  const weeks = Math.max(meta.simulatedDays / 7, 1 / 7);
  const perPersona = new Map<string, Map<string, { calls: number; created: number }>>();
  const actors = new Map<string, Set<string>>();
  for (const e of events) {
    const base = basePersonaId(e.personaId);
    (actors.get(base) ?? actors.set(base, new Set()).get(base) as Set<string>).add(e.personaId);
    const map = perPersona.get(base) ?? (perPersona.set(base, new Map()).get(base) as Map<string, { calls: number; created: number }>);
    for (const c of e.apiCalls) {
      const k = key(c.method, c.path);
      const slot = map.get(k) ?? { calls: 0, created: 0 };
      slot.calls += 1;
      slot.created += c.status === 201 ? 1 : 0;
      map.set(k, slot);
    }
  }
  const peak = time.multipliers.peak;
  const scenarios = userScenarios.map((users) => {
    const totals = new Map<string, { perWeek: number; peak: number; created: number }>();
    for (const p of personas) {
      const clones = actors.get(p.id)?.size ?? 1;
      const scale = (p.populationWeight * users) / clones / weeks;
      const activeSeconds = 7 * p.activeHours.length * 3600;
      for (const [k, v] of perPersona.get(p.id) ?? []) {
        const t = totals.get(k) ?? { perWeek: 0, peak: 0, created: 0 };
        t.perWeek += v.calls * scale;
        t.peak += ((v.calls * scale) / activeSeconds) * peak;
        t.created += v.created * scale;
        totals.set(k, t);
      }
    }
    const endpoints = [...totals.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([endpoint, t]) => ({ endpoint, requestsPerWeek: round4(t.perWeek), peakRequestsPerSecond: round4(t.peak) }));
    const objects = round4([...totals.values()].reduce((s, t) => s + t.created, 0));
    return { users, endpoints, objectsPerWeek: objects, storageGrowthBytesPerWeek: Math.round(objects * BYTES_PER_OBJECT) };
  });
  const latencies = new Map<string, number[]>();
  for (const c of events.flatMap((e) => e.apiCalls)) {
    const k = key(c.method, c.path);
    (latencies.get(k) ?? latencies.set(k, []).get(k) as number[]).push(c.ms);
  }
  const measuredLatency = [...latencies.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([endpoint, ms]) => ({ endpoint, count: ms.length, p50: quantile(ms, 0.5), p95: quantile(ms, 0.95), p99: quantile(ms, 0.99) }));
  return { type: 'load', meta, assumptions: { bytesPerObject: BYTES_PER_OBJECT, peakMultiplier: peak }, scenarios, measuredLatency };
}
