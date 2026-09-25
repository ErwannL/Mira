import { describe, expect, it } from 'vitest';
import { persona, timeConfig } from '../../shared/test-helpers/fixtures.js';
import { journeyDeps, MemStore, ScriptedDriver } from '../test-helpers/scripted.js';
import { simulate, type SimulationDeps } from './simulate.js';

const busy = { ...persona('project-manager'), sessionsPerWeek: 1000, errorProneness: 0, curiosity: 0, sessionLengthMin: 6 };
const plan = { seed: 11, personas: [busy], start: new Date('2030-01-07T07:00:00Z'), totalSimulatedDays: 2, minutesPerRound: 60, timeConfig };

function deps(overrides: Partial<SimulationDeps> = {}) {
  const driver = new ScriptedDriver();
  const store = new MemStore();
  const { deps: j, events } = journeyDeps(driver);
  const d: SimulationDeps = {
    ...j,
    memoryStore: store,
    newCredentials: (p) => ({ email: `synth+r-${p.id}@synthetic.invalid`, password: 'x' }),
    initialVars: () => ({ boardName: 'B', cardTitle: 'C' }),
    ...overrides,
  };
  return { d, driver, store, events };
}

describe('simulate', () => {
  it('runs sessions until the life ends, persisting memory each session', async () => {
    const { d, store } = deps();
    const summary = await simulate(plan, d);
    expect(summary.stages[busy.id]).toBe('done');
    expect(summary.sessions).toBeGreaterThan(1);
    expect(summary.rounds).toBeLessThan(48);
    expect(store.data.get(busy.id)!.memory.stage).toBe('done');
  });
  it('same seed ⇒ same event sequence', async () => {
    const a = deps();
    const b = deps();
    await simulate(plan, a.d);
    await simulate(plan, b.d);
    const strip = (e: { useCaseId: string | null; action: string | null; rule: string; simTime: string }) => [e.useCaseId, e.action, e.rule, e.simTime];
    expect(a.events.map(strip)).toEqual(b.events.map(strip));
  });
  it('resumes a stored life (credentials kept)', async () => {
    const first = deps();
    await simulate({ ...plan, totalSimulatedDays: 0.05 }, first.d);
    const again = deps({ memoryStore: first.store, newCredentials: () => { throw new Error('must reuse'); } });
    const s = await simulate(plan, again.d);
    expect(s.stages[busy.id]).toBe('done');
  });
  it('skips inactive personas and honours cancel', async () => {
    const idle = { ...busy, sessionsPerWeek: 0 };
    const { d } = deps();
    expect((await simulate({ ...plan, personas: [idle] }, d)).sessions).toBe(0);
    let n = 0;
    const cancel = deps({ shouldStop: () => ++n > 2 });
    const s = await simulate({ ...plan, personas: [busy, { ...busy, id: 'twin' }] }, cancel.d);
    expect(s.stopped).toBe(true);
    const stopNow = deps({ shouldStop: () => true });
    expect((await simulate(plan, stopNow.d)).rounds).toBe(0);
  });
});
