import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogue, timeConfig } from '../../shared/test-helpers/fixtures.js';
import { testPlans } from '../test-helpers/scripted.js';
import { sampleMeta, samplePersonas, sampleRun } from '../test-helpers/sample-run.js';
import { buildCalibration, parseAggregates } from './calibration.js';
import { buildComparison } from './compare.js';
import { buildFunnel, HEADLINE } from './funnel.js';
import { renderReportHtml } from './html.js';
import { basePersonaId, buildLoad, BYTES_PER_OBJECT } from './load.js';
import { buildPricing } from './pricing.js';
import { countBy, median, quantile, round4, top } from './stats.js';
import { DISCLAIMER } from './meta.js';

const endpoints = [
  { method: 'POST', path: '/api/auth/register' },
  { method: 'GET', path: '/api/boards/:boardId' },
  { method: 'GET', path: '/api/me' },
  { method: 'GET', path: '/api/admin/synthetic/target' },
  { method: 'GET', path: '/api' },
];

describe('stats', () => {
  it('quantiles, medians, rounding, counting, top-n with deterministic ties', () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([3, 1, 2], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(median([5])).toBe(5);
    expect(round4(1 / 3)).toBe(0.3333);
    expect(countBy(['a', 'b', 'a'], (x) => x)).toEqual({ a: 2, b: 1 });
    expect(top({ b: 2, a: 2, c: 5 }, 2)).toEqual([{ key: 'c', count: 5 }, { key: 'a', count: 2 }]);
  });
});

describe('funnel report', () => {
  it('matches the golden JSON for a fixed seed', async () => {
    const { events, memories } = await sampleRun();
    const report = buildFunnel(sampleMeta, catalogue, samplePersonas, events, memories, endpoints);
    const golden = join(import.meta.dirname, 'golden', 'funnel.json');
    if (process.env.UPDATE_GOLDEN === '1') writeFileSync(golden, `${JSON.stringify(report, null, 2)}\n`);
    expect(JSON.parse(JSON.stringify(report))).toEqual(JSON.parse(readFileSync(golden, 'utf8')));
  });

  it('shows who abandoned where, with the screenshot and reasons, and the coverage matrix', async () => {
    const { events, memories } = await sampleRun();
    const r = buildFunnel(sampleMeta, catalogue, samplePersonas, events, memories, endpoints);
    expect(r.meta.disclaimer).toBe(DISCLAIMER(3));
    expect(r.headline.map((h) => h.id)).toEqual(HEADLINE);
    const signup = r.useCases.find((u) => u.id === 'signup')!;
    expect(signup.personas['retired-volunteer']).toMatchObject({ attempted: true, succeeded: false, abandoned: true });
    expect(signup.abandonScreenshot).toMatch(/^shot-\d+\.jpg$/);
    expect(signup.topAbandonReasons[0]!.key).toBe('too-many-fields');
    const volunteer = r.personas.find((p) => p.id === 'retired-volunteer')!;
    expect(volunteer).toMatchObject({ stage: 'abandoned', abandonedAt: 'signup' });
    expect(r.coverage.endpointsNeverCalled).toEqual(['GET /api/me']);
    expect(r.coverage.useCasesNeverAttempted).toContain('account-delete');
    expect(r.coverage.pagesSeen).toContain('/landing');
  });

  it('copes with personas that never lived (no memory, no events)', () => {
    const r = buildFunnel(sampleMeta, catalogue, samplePersonas, [], [], []);
    expect(r.personas[0]).toMatchObject({ stage: 'new', sessions: 0, frustration: 0, succeeded: [], abandonedAt: null, lastRule: null, money: [] });
    expect(r.useCases[0]!.medianFriction).toBeNull();
  });

  it('abandon reasons fall back to the rule when friction had no reason', () => {
    const e = { kind: 'step' as const, personaId: 'student', session: 1, simTime: 'x', wallTime: 'x', useCaseId: 'signup', attempt: 1, ok: false, wallMs: 1, facts: null, friction: { score: 0, reasons: [] }, frustration: 1, action: 'abandon' as const, rule: 'hard block: control-without-accessible-name', mistakes: [], screenshot: null, apiCalls: [], money: null, error: null };
    const r = buildFunnel(sampleMeta, catalogue, samplePersonas, [e, { ...e, friction: null, rule: 'paywall churn: x' }], [], []);
    expect(r.useCases.find((u) => u.id === 'signup')!.topAbandonReasons.map((x) => x.key)).toEqual(['hard block', 'paywall churn']);
  });
});

describe('comparison (A/B)', () => {
  it('finds who got hurt and helped, friction and funnel deltas', async () => {
    const a = buildFunnel(sampleMeta, catalogue, samplePersonas, ...Object.values(await sampleRun(3)) as [never, never], endpoints);
    const b = buildFunnel({ ...sampleMeta, seed: 1 }, catalogue, samplePersonas, ...Object.values(await sampleRun(6)) as [never, never], endpoints);
    const c = buildComparison(a, b);
    expect(c.sameSeed).toBe(false);
    expect(c.hurt).toContainEqual({ personaId: 'retired-volunteer', useCaseId: 'signup', why: 'abandoned in B' });
    expect(c.funnelDelta.find((d) => d.id === 'signup')!.delta).toBeLessThan(0);
    expect(c.frictionDelta.find((d) => d.id === 'signup')!.delta).toBeGreaterThan(0);
    const back = buildComparison(b, a);
    expect(back.helped).toContainEqual({ personaId: 'retired-volunteer', useCaseId: 'signup', why: 'succeeds only in B' });
    expect(buildComparison(a, a).sameSeed).toBe(true);
  });
  it('flags friction increases above the threshold and missing rows', async () => {
    const a = buildFunnel(sampleMeta, catalogue, samplePersonas, ...Object.values(await sampleRun(3)) as [never, never], endpoints);
    const b = structuredClone(a);
    const landing = b.useCases.find((u) => u.id === 'landing')!;
    landing.personas['student']!.medianFriction = (landing.personas['student']!.medianFriction ?? 0) + 0.5;
    b.useCases = b.useCases.filter((u) => u.id !== 'account-delete');
    delete b.useCases.find((u) => u.id === 'signup')!.personas['student'];
    const c = buildComparison(a, b);
    expect(c.hurt.find((h) => h.useCaseId === 'landing')!.why).toBe('friction +0.5');
    expect(c.frictionDelta.find((d) => d.id === 'account-delete')).toEqual({ id: 'account-delete', a: null, b: null, delta: null });
  });
  it('a use case that stays failed on both sides is neither hurt nor helped', async () => {
    const a = buildFunnel(sampleMeta, catalogue, samplePersonas, ...Object.values(await sampleRun(6)) as [never, never], endpoints);
    const c = buildComparison(a, a);
    expect(c.hurt).toEqual([]);
    expect(c.helped).toEqual([]);
  });
});

describe('load forecast', () => {
  it('extrapolates per user scenario and measures latency percentiles', async () => {
    const { events } = await sampleRun(3);
    const r = buildLoad(sampleMeta, samplePersonas, events, timeConfig, [100, 1000]);
    const [s100, s1000] = r.scenarios;
    expect(s100!.users).toBe(100);
    const reg100 = s100!.endpoints.find((e) => e.endpoint === 'POST /api/auth/register')!;
    const reg1000 = s1000!.endpoints.find((e) => e.endpoint === 'POST /api/auth/register')!;
    expect(reg1000.requestsPerWeek).toBeCloseTo(reg100.requestsPerWeek * 10, 2);
    expect(reg100.peakRequestsPerSecond).toBeGreaterThan(0);
    expect(s100!.storageGrowthBytesPerWeek).toBe(Math.round(s100!.objectsPerWeek * BYTES_PER_OBJECT));
    const lat = r.measuredLatency.find((l) => l.endpoint === 'POST /api/auth/register')!;
    expect(lat.p50).toBeGreaterThanOrEqual(10);
    expect(lat.p99).toBeLessThanOrEqual(16);
  });
  it('maps volume clones back to their persona and handles tiny/empty runs', () => {
    expect(basePersonaId('student-c12')).toBe('student');
    expect(basePersonaId('student')).toBe('student');
    const clone = { kind: 'step' as const, personaId: 'student-c1', session: 1, simTime: 'x', wallTime: 'x', useCaseId: 'signup', attempt: 1, ok: true, wallMs: 1, facts: null, friction: null, frustration: 0, action: 'continue' as const, rule: '', mistakes: [], screenshot: null, apiCalls: [{ method: 'POST', path: '/api/auth/register', status: 201, ms: 5 }], money: null, error: null };
    const r = buildLoad({ ...sampleMeta, simulatedDays: 0.1 }, samplePersonas, [clone, { ...clone, personaId: 'student-c2' }], timeConfig, [7]);
    expect(r.scenarios[0]!.objectsPerWeek).toBeGreaterThan(0);
    expect(buildLoad(sampleMeta, samplePersonas, [], timeConfig, [10]).scenarios[0]!.endpoints).toEqual([]);
  });
});

describe('pricing', () => {
  it('replays money decisions under target prices and alternatives', async () => {
    const { memories } = await sampleRun(3);
    const r = buildPricing(sampleMeta, samplePersonas, memories, testPlans, [{ name: 'cheap', prices: { pro: 1 } }, { name: 'dear', prices: { pro: 500 } }]);
    expect(r.scenarios.map((s) => s.name)).toEqual(['target', 'cheap', 'dear']);
    const [target, cheap, dear] = r.scenarios;
    expect(cheap!.weightedConversion).toBeGreaterThanOrEqual(target!.weightedConversion);
    expect(dear!.revenuePer1000Users).toBe(0);
    expect(target!.personas.find((p) => p.id === 'project-manager')!.decision).toBe('convert');
    expect(r.paywallTriggers.length).toBeGreaterThan(0);
    const none = buildPricing(sampleMeta, samplePersonas, [], testPlans, []);
    expect(none.scenarios[0]!.personas[0]!.decision).toBe('no-encounter');
    expect(none.paywallTriggers).toEqual([]);
  });
  it('records churn and defer outcomes', async () => {
    const { memories } = await sampleRun(3);
    const expensive = buildPricing(sampleMeta, samplePersonas.map((p) => ({ ...p, valueThreshold: 1 })), memories, testPlans, [{ name: 'dear', prices: { pro: 500 } }]);
    const decisions = expensive.scenarios[1]!.personas.map((p) => p.decision);
    expect(decisions).toContain('churn');
    const affordable = buildPricing(sampleMeta, samplePersonas.map((p) => ({ ...p, valueThreshold: 1 })), memories, testPlans, []);
    expect(affordable.scenarios[0]!.personas.map((p) => p.decision)).toContain('defer');
  });
});

describe('calibration', () => {
  it('parses CSV and JSON aggregates', () => {
    expect(parseAggregates('step,share\nlanding,1\nsignup, 0.5\n\n')).toEqual({ funnel: { landing: 1, signup: 0.5 } });
    expect(parseAggregates('{"funnel":{"login":0.3}}')).toEqual({ funnel: { login: 0.3 } });
    expect(() => parseAggregates('landing,2')).toThrow();
  });
  it('compares and suggests weight changes, never applying them', async () => {
    const f = buildFunnel(sampleMeta, catalogue, samplePersonas, ...Object.values(await sampleRun(6)) as [never, never], endpoints);
    const tooOptimistic = buildCalibration(f, { funnel: { landing: 1, signup: 0.2, login: 0.95, 'create-board': 0.1 } });
    expect(tooOptimistic.rows.find((r) => r.step === 'verify-email')).toMatchObject({ real: null, delta: null });
    expect(tooOptimistic.suggestions).toContainEqual(expect.objectContaining({ personaId: 'retired-volunteer', direction: 'increase' }));
    expect(tooOptimistic.suggestions).toContainEqual(expect.objectContaining({ personaId: 'project-manager', direction: 'decrease' }));
    expect(tooOptimistic.note).toContain('never changed automatically');
    const ok = buildCalibration(f, { funnel: { landing: 1 } });
    expect(ok.suggestions).toEqual([]);
  });
});

describe('HTML export', () => {
  it('renders every report type self-contained, in English and French, escaping content', async () => {
    const { events, memories } = await sampleRun(6);
    const funnel = buildFunnel(sampleMeta, catalogue, samplePersonas, events, memories, endpoints);
    const img = (f: string) => (f.endsWith('1.jpg') ? null : `data:image/jpeg;base64,AAAA`);
    const en = renderReportHtml(funnel, 'en', img);
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('Simulation of 3 modelled personas, not a measurement of real users.');
    expect(en).toContain('Use-case funnel');
    expect(en).not.toMatch(/<script|src="http/);
    expect(renderReportHtml(funnel, 'fr', () => null)).toContain('Entonnoir par cas d’usage');
    const html = renderReportHtml({ ...funnel, personas: [{ ...funnel.personas[0]!, lastRule: '<b>x</b>' }] }, 'en', img);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    const empty = buildFunnel(sampleMeta, catalogue, samplePersonas, [], [], []);
    expect(renderReportHtml(empty, 'en', img)).toContain('Nothing to show.');
    const cmp = buildComparison(funnel, { ...funnel, meta: { ...funnel.meta, seed: 9 } });
    expect(renderReportHtml(cmp, 'en', img)).toContain('different seeds');
    expect(renderReportHtml(buildComparison(funnel, funnel), 'fr', img)).toContain('Même graine');
    expect(renderReportHtml(buildLoad(sampleMeta, samplePersonas, events, timeConfig, [100]), 'en', img)).toContain('100 users');
    expect(renderReportHtml(buildLoad(sampleMeta, samplePersonas, [], timeConfig, [5]), 'en', img)).not.toContain('<table><thead><tr><th>Endpoint');
    expect(renderReportHtml(buildPricing(sampleMeta, samplePersonas, memories, testPlans, []), 'en', img)).toContain('Weighted conversion');
    expect(renderReportHtml(buildCalibration(funnel, { funnel: { signup: 0.9 } }), 'en', img)).toContain('Suggested persona-weight changes');
  });
});
