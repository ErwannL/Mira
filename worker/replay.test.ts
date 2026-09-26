import { describe, expect, it } from 'vitest';
import { catalogue } from '../shared/test-helpers/fixtures.js';
import { vigieScenarioSchema, type VigieScenario } from '../shared/vigie.js';
import { SCENARIO } from '../shared/test-helpers/vigie.js';
import { outcome, ScriptedDriver, type Script } from './test-helpers/scripted.js';
import { breached, replayScenario, statusOf } from './replay.js';

const scenario = (steps: unknown[], persona = SCENARIO.persona): VigieScenario =>
  vigieScenarioSchema.parse({ ...SCENARIO, persona, steps });

function setup(script: Script = () => ({})) {
  const driver = new ScriptedDriver(script);
  const slept: number[] = [];
  const verified: string[] = [];
  const deps = {
    catalogue,
    openDriver: async () => driver,
    requestVerifyUrl: async (email: string) => {
      verified.push(email);
      return 'http://t/verify-email?token=tok';
    },
    sleep: async (ms: number) => void slept.push(ms),
  };
  return { driver, deps, slept, verified };
}

describe('replaying a Vigie scenario', () => {
  it("Vigie's example: login (account set up untimed), visits, board created for :boardId", async () => {
    const { driver, deps, verified } = setup((uc) =>
      uc.id === 'create-board'
        ? { pages: ['/dashboard', '/board/42'] }
        : uc.id === 'vigie-visit'
          ? {
              wallMs: 500,
              navigationStatus: 200,
              apiCalls: [{ method: 'GET', path: '/api/boards/:id', status: 200, ms: 1 }],
            }
          : {},
    );
    const r = await replayScenario('r1', scenario(SCENARIO.steps), deps);
    expect(driver.calls.map((c) => c.id)).toEqual([
      'signup',
      'verify-email',
      'login',
      'vigie-visit',
      'create-board',
      'vigie-visit',
    ]);
    expect(driver.calls[0]!.ctx.vars.email).toBe('synth+r1-vigie-replay@synthetic.invalid');
    expect(driver.calls[1]!.ctx.vars.verifyToken).toBe('tok');
    expect(verified).toHaveLength(1);
    expect(driver.calls[5]!.ctx.persona.device).toBe('mobile');
    expect(r.steps.map((s) => [s.index, s.action, s.ok, s.breached])).toEqual([
      [0, 'login', true, false],
      [1, 'visit', true, false],
      [2, 'visit', true, true], // 500 ms > 340 ms
    ]);
    expect(r).toMatchObject({ reproduced: true, incomplete: null });
    expect(r.steps[2]).toMatchObject({ durationMs: 500, status: 200 });
    expect(driver.closed).toBe(1);
  });

  it('within its expectation, the incident is not reproduced; public pages need no account', async () => {
    const { driver, deps } = setup(() => ({ wallMs: 100, navigationStatus: 200 }));
    const r = await replayScenario(
      'r2',
      scenario([
        { action: 'visit', target: '/' },
        { action: 'visit' },
        { action: 'visit', target: '/login', expect: { maxDurationMs: 340, status: 200 } },
      ]),
      deps,
    );
    expect(driver.calls.map((c) => c.id)).toEqual(['vigie-visit', 'vigie-visit', 'vigie-visit']);
    expect(driver.calls[1]!.id).toBe('vigie-visit');
    expect(r).toMatchObject({ reproduced: false, incomplete: null });
  });

  it('signup, use_feature with prerequisites, wait, and a status breach', async () => {
    const { driver, deps, slept } = setup((uc) =>
      uc.id === 'create-card'
        ? { apiCalls: [{ method: 'POST', path: '/api/cards', status: 500, ms: 3 }] }
        : {},
    );
    const r = await replayScenario(
      'r3',
      scenario([
        { action: 'signup', target: null },
        { action: 'use_feature', target: 'card.create', expect: { status: 201 } },
        { action: 'wait', target: 25 },
        { action: 'wait' },
        { action: 'wait', target: 999_999 },
      ]),
      deps,
    );
    expect(driver.calls.map((c) => c.id)).toEqual([
      'signup',
      'verify-email',
      'login',
      'create-board',
      'create-card',
    ]);
    expect(slept).toEqual([25, 1000, 10_000]);
    expect(r.steps[1]).toMatchObject({ status: 500, breached: true });
    expect(r.steps[2]).toMatchObject({ durationMs: 25, status: null, ok: true });
    expect(r.reproduced).toBe(true);
  });

  it('a step that fails in the target breaches its expectation; one Figura cannot replay does not', async () => {
    const { deps } = setup((uc) => (uc.id === 'login' ? { ok: false, error: 'no button' } : {}));
    const failed = await replayScenario(
      'r4',
      scenario([{ action: 'login', target: null, expect: { maxDurationMs: 1000 } }]),
      deps,
    );
    expect(failed).toMatchObject({ reproduced: true, incomplete: null });
    const cases: [unknown, string][] = [
      [{ action: 'click', target: 'save-btn', expect: { status: 200 } }, 'click steps'],
      [
        { action: 'use_feature', target: 'teleport', expect: { status: 200 } },
        'unknown feature teleport',
      ],
      [{ action: 'use_feature', expect: { status: 200 } }, 'unknown feature'],
      [{ action: 'visit', target: '/x/:teamId', expect: { status: 200 } }, 'no value for :teamId'],
      [
        { action: 'visit', target: '/board/:boardId', expect: { status: 200 } },
        'no value for :boardId',
      ],
    ];
    for (const [step, why] of cases) {
      const r = await replayScenario('r5', scenario([step]), setup().deps);
      expect(r.reproduced).toBe(false);
      expect(r.incomplete).toContain(why);
      expect(r.steps[0]).toMatchObject({ ok: false, breached: false, durationMs: 0 });
    }
    const noExpect = await replayScenario(
      'r6',
      scenario([{ action: 'click', target: 'x' }]),
      setup().deps,
    );
    expect(noExpect.incomplete).toBeNull();
  });

  it('a failing setup is reported as incomplete, not as the incident', async () => {
    const { deps } = setup((uc) =>
      uc.id === 'verify-email' ? { ok: false, error: 'bad link' } : {},
    );
    const r = await replayScenario(
      'r7',
      scenario([{ action: 'visit', target: '/dashboard', expect: { status: 200 } }]),
      deps,
    );
    expect(r.incomplete).toBe('step 0: setup verify-email failed: bad link');
    const noToken = setup();
    noToken.deps.requestVerifyUrl = async () => 'http://t/verify-email';
    const ok = await replayScenario(
      'r8',
      scenario([{ action: 'login', target: null }]),
      noToken.deps,
    );
    expect(noToken.driver.calls[1]!.ctx.vars.verifyToken).toBe('');
    expect(ok.steps[0]!.ok).toBe(true);
  });

  it('statusOf and breached', () => {
    expect(statusOf(outcome())).toBeNull();
    expect(statusOf(outcome({ navigationStatus: 0 }))).toBeNull();
    expect(
      statusOf(
        outcome({
          navigationStatus: 200,
          apiCalls: [{ method: 'GET', path: '/a', status: 404, ms: 1 }],
        }),
      ),
    ).toBe(404);
    const step = (expect?: object) => ({
      action: 'visit' as const,
      target: '/',
      ...(expect ? { expect } : {}),
    });
    const ok = { ok: true, durationMs: 100, status: 200 };
    expect(breached(step(), ok)).toBe(false);
    expect(breached(step({}), { ...ok, ok: false })).toBe(false);
    expect(breached(step({ status: 200 }), ok)).toBe(false);
    expect(breached(step({ status: 200 }), { ...ok, status: 503 })).toBe(true);
    expect(breached(step({ maxDurationMs: 99 }), ok)).toBe(true);
    expect(breached(step({ maxDurationMs: 100 }), ok)).toBe(false);
    expect(breached(step({ maxDurationMs: 100 }), { ...ok, ok: false })).toBe(true);
  });

  it('closes the driver even when the replay itself throws', async () => {
    const { driver, deps } = setup(() => {
      throw new Error('browser died');
    });
    deps.requestVerifyUrl = async () => {
      throw new Error('never');
    };
    // A driver crash inside a step is caught per step; the driver is closed at the end.
    const r = await replayScenario('r9', scenario([{ action: 'signup' }]), deps);
    expect(r.steps[0]!.error).toBe('browser died');
    expect(driver.closed).toBe(1);
  });
});
