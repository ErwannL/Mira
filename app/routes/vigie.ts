import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomInt } from 'node:crypto';
import { base36Id } from '../../shared/crypto.js';
import { runConfigSchema } from '../../shared/run-config.js';
import { applyTarget, TARGET_NOT_CONFIGURED } from '../../shared/targets.js';
import {
  isProductionEnv,
  personasOfSet,
  setIdOf,
  targetNameOf,
  vigiePersonaSetSchema,
  vigieScenarioSchema,
} from '../../shared/vigie.js';
import type { SimData } from '../../worker/data.js';
import type { ReplayResult } from '../../worker/replay.js';
import { REFUSAL_MESSAGES } from '../../worker/target/guard.js';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/pool.js';
import { audit } from '../db/misc.js';
import { createRun, getRun, transition, type RunRow } from '../db/runs.js';
import { saveVigieSet } from '../db/vigie.js';
import { isVigiePath, vigieAuthorized } from '../security.js';

export type VigieState = 'queued' | 'running' | 'reproduced' | 'not_reproduced' | 'failed';

/** Figura's run lifecycle as Vigie's five states. */
export function vigieState(run: RunRow): VigieState {
  if (run.status === 'draft' || run.status === 'queued' || run.status === 'preparing')
    return 'queued';
  if (run.status === 'running' || run.status === 'reporting' || run.status === 'cleaning')
    return 'running';
  if (run.status !== 'done') return 'failed';
  return (run.summary?.replay as ReplayResult | undefined)?.reproduced
    ? 'reproduced'
    : 'not_reproduced';
}

const issues = (e: { issues: { path: PropertyKey[]; message: string }[] }) =>
  e.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`);

/** 409 before any work: Figura never replays in production, nor on an unconfigured target. */
function refuseTarget(reply: FastifyReply, targetEnv: string, cfg: AppConfig) {
  if (isProductionEnv(targetEnv))
    return reply
      .code(409)
      .send({ error: 'PRODUCTION_ENV', message: REFUSAL_MESSAGES.PRODUCTION_ENV });
  if (!(targetNameOf(targetEnv) in cfg.targets))
    return reply
      .code(409)
      .send({ error: TARGET_NOT_CONFIGURED, message: REFUSAL_MESSAGES.TARGET_NOT_CONFIGURED });
  return null;
}

/** Vigie's service API (docs/VIGIE.md): Bearer FIGURA_VIGIE_SECRET, no session. */
export function vigieRoutes(app: FastifyInstance, cfg: AppConfig, db: Db, data: SimData): void {
  app.addHook('preHandler', async (req, reply) => {
    if (isVigiePath(req.url) && !vigieAuthorized(req.headers.authorization, cfg.vigieSecret))
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
  });

  app.post('/api/vigie/replays', async (req, reply) => {
    const parsed = vigieScenarioSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'INVALID_SCENARIO', issues: issues(parsed.error) });
    const s = parsed.data;
    const refused = refuseTarget(reply, s.targetEnv, cfg);
    if (refused) return refused;
    const resolved = applyTarget(
      {
        kind: 'replay',
        target: targetNameOf(s.targetEnv),
        label: `Vigie ${s.incidentId ?? 'scenario'} (${s.sourceEnv} → ${s.targetEnv})`.slice(
          0,
          120,
        ),
        replay: s,
      },
      cfg.targets,
    );
    if ('error' in resolved)
      return reply.code(409).send({ error: resolved.error, message: resolved.issues.join('; ') });
    const config = runConfigSchema.parse(resolved.config);
    const id = base36Id();
    await createRun(db, id, config, randomInt(0, 2 ** 31), 'vigie');
    await transition(db, id, 'queued', 'vigie', 'queued by Vigie');
    await audit(db, 'vigie', 'replay.create', {
      id,
      target: config.target,
      incident: s.incidentId,
    });
    return reply.code(202).send({ runId: id });
  });

  app.get('/api/vigie/replays/:runId', async (req, reply) => {
    const run = await getRun(db, (req.params as { runId: string }).runId);
    if (!run || run.kind !== 'replay') return reply.code(404).send({ error: 'NOT_FOUND' });
    const replay = run.summary?.replay as ReplayResult | undefined;
    const state = vigieState(run);
    return {
      state,
      evidence: { steps: replay?.steps ?? [] },
      ...(state === 'failed' ? { error: run.refusal_code ?? run.error } : {}),
    };
  });

  app.post('/api/vigie/personas', async (req, reply) => {
    const parsed = vigiePersonaSetSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'INVALID_PERSONA_SET', issues: issues(parsed.error) });
    const set = parsed.data;
    const refused = refuseTarget(reply, set.targetEnv, cfg);
    if (refused) return refused;
    const known = (id: string) => data.catalogue.useCases.some((u) => u.id === id);
    const personas = personasOfSet(set, known);
    const ids = personas.map((p) => p.id);
    if (new Set(ids).size !== ids.length)
      return reply
        .code(400)
        .send({ error: 'INVALID_PERSONA_SET', issues: ['personas: duplicate names'] });
    const setId = setIdOf(set);
    const saved = await saveVigieSet(db, {
      setId,
      sourceEnv: set.sourceEnv,
      targetEnv: set.targetEnv,
      personas,
    });
    if (saved.created) await audit(db, 'vigie', 'personas.push', { setId, ids });
    return reply.code(202).send({ accepted: saved.accepted, setId });
  });
}
