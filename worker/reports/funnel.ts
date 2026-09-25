import type { Catalogue } from '../../shared/catalogue-schema.js';
import type { Persona } from '../../shared/persona-schema.js';
import type { JourneyEvent, Memory } from '../engine/types.js';
import { key } from '../target/drift.js';
import type { Endpoint } from '../target/client.js';
import type { ReportMeta } from './meta.js';
import { countBy, median, round4, top } from './stats.js';

export const HEADLINE = ['landing', 'signup', 'verify-email', 'login', 'create-board', 'create-card'];

export interface PersonaCell {
  attempted: boolean;
  succeeded: boolean;
  abandoned: boolean;
  skipped: boolean;
  attempts: number;
  medianFriction: number | null;
  screenshot: string | null;
}

export interface UseCaseRow {
  id: string;
  title: { en: string; fr: string };
  attempted: number;
  succeeded: number;
  abandoned: number;
  medianFriction: number | null;
  topAbandonReasons: { key: string; count: number }[];
  abandonScreenshot: string | null;
  personas: Record<string, PersonaCell>;
}

export interface FunnelReport {
  type: 'funnel';
  meta: ReportMeta;
  headline: { id: string; personas: number; weightedShare: number }[];
  useCases: UseCaseRow[];
  personas: { id: string; stage: string; sessions: number; frustration: number; succeeded: string[]; abandonedAt: string | null; lastRule: string | null; money: string[] }[];
  coverage: { useCasesNeverAttempted: string[]; endpointsNeverCalled: string[]; pagesSeen: string[] };
}

const steps = (events: JourneyEvent[]) => events.filter((e) => e.kind === 'step' && e.useCaseId !== null);

function cell(stepEvents: JourneyEvent[], memory: Memory | undefined, useCaseId: string): PersonaCell {
  const tried = stepEvents.filter((e) => e.facts !== null);
  const abandonedHere = tried.find((e) => e.action === 'abandon');
  return {
    attempted: tried.length > 0,
    succeeded: memory?.succeeded.includes(useCaseId) ?? false,
    abandoned: abandonedHere !== undefined,
    skipped: memory?.skipped.includes(useCaseId) ?? false,
    attempts: tried.length,
    medianFriction: median(tried.map((e) => (e.friction as { score: number }).score)),
    screenshot: abandonedHere?.screenshot ?? null,
  };
}

export function buildFunnel(meta: ReportMeta, catalogue: Catalogue, personas: Persona[], events: JourneyEvent[], memories: Memory[], endpoints: Endpoint[]): FunnelReport {
  const memo = new Map(memories.map((m) => [m.personaId, m]));
  const all = steps(events);
  const useCases: UseCaseRow[] = catalogue.useCases.map((u) => {
    const mine = all.filter((e) => e.useCaseId === u.id);
    const cells = Object.fromEntries(personas.map((p) => [p.id, cell(mine.filter((e) => e.personaId === p.id), memo.get(p.id), u.id)]));
    const abandons = mine.filter((e) => e.action === 'abandon');
    const reasons = abandons.map((e) => e.friction?.reasons[0]?.code ?? e.rule.split(':')[0] as string);
    return {
      id: u.id,
      title: u.title,
      attempted: Object.values(cells).filter((c) => c.attempted).length,
      succeeded: Object.values(cells).filter((c) => c.succeeded).length,
      abandoned: abandons.length,
      medianFriction: median(mine.filter((e) => e.friction).map((e) => (e.friction as { score: number }).score)),
      topAbandonReasons: top(countBy(reasons, (r) => r), 3),
      abandonScreenshot: abandons.find((e) => e.screenshot)?.screenshot ?? null,
      personas: cells,
    };
  });
  const headline = HEADLINE.map((id) => {
    const reached = personas.filter((p) => memo.get(p.id)?.succeeded.includes(id));
    return { id, personas: reached.length, weightedShare: round4(reached.reduce((s, p) => s + p.populationWeight, 0)) };
  });
  const personaRows = personas.map((p) => {
    const m = memo.get(p.id);
    const mine = all.filter((e) => e.personaId === p.id);
    const abandon = mine.find((e) => e.action === 'abandon');
    return {
      id: p.id,
      stage: m?.stage ?? 'new',
      sessions: m?.sessions ?? 0,
      frustration: m?.frustration ?? 0,
      succeeded: m?.succeeded ?? [],
      abandonedAt: abandon?.useCaseId ?? null,
      lastRule: mine.at(-1)?.rule ?? null,
      money: (m?.money ?? []).map((x) => `${x.encounter.featureKey ?? 'pricing-page'}: ${x.outcome.decision}`),
    };
  });
  const called = new Set(events.flatMap((e) => e.apiCalls.map((c) => key(c.method, c.path))));
  return {
    type: 'funnel',
    meta,
    headline,
    useCases,
    personas: personaRows,
    coverage: {
      useCasesNeverAttempted: useCases.filter((u) => u.attempted === 0).map((u) => u.id),
      endpointsNeverCalled: [...new Set(endpoints.map((e) => key(e.method, e.path)))].filter((k) => !called.has(k) && !k.includes('/api/admin/') && k !== 'GET /api').sort(),
      pagesSeen: [...new Set(memories.flatMap((m) => m.pagesSeen))].sort(),
    },
  };
}
