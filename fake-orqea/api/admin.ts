import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isLoopbackHost, parseSyntheticEmail, safeEqual } from '../../shared/synthetic.js';
import type { Deps } from '../context.js';
import { resolveScenario } from '../scenario.js';

/** Synthetic-users admin API: synthetic mode only, never in production, local sources only, shared secret. */
export function adminApi(app: FastifyInstance, deps: Deps): void {
  const { config, store } = deps;
  const guard = async (req: FastifyRequest, reply: FastifyReply) => {
    const enabled = config.syntheticEnabled && !/^prod/i.test(config.env);
    const local = isLoopbackHost(req.ip) || config.adminAllowed.some((p) => req.ip.startsWith(p));
    if (!enabled || !local) return reply.code(404).send({ error: 'NOT_FOUND' });
    const auth = req.headers.authorization ?? '';
    if (!safeEqual(auth, `Bearer ${config.serviceSecret}`)) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
  };
  const body = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;

  app.get('/api/admin/synthetic/target', { preHandler: guard }, async () => ({
    env: config.env,
    stripeMode: config.stripeMode,
    syntheticEnabled: config.syntheticEnabled,
    version: config.version,
  }));

  app.post('/api/admin/synthetic/verification', { preHandler: guard }, async (req, reply) => {
    const { email, runId } = body(req);
    const user = store.userByEmail(String(email ?? '').toLowerCase());
    const parsed = parseSyntheticEmail(String(email ?? ''));
    if (!user || !parsed || parsed.runId !== runId || user.verified) {
      return reply.code(404).send({ error: 'NO_UNVERIFIED_SYNTHETIC_ACCOUNT' });
    }
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
    return { verifyUrl: `${proto}://${req.headers.host}/api/auth/verify-email?token=${user.verifyToken}` };
  });

  app.post('/api/admin/synthetic/cleanup', { preHandler: guard }, async (req, reply) => {
    const { runId, olderThanHours } = body(req);
    const synthetic = (email: string) => parseSyntheticEmail(email);
    let match: (u: { email: string; createdAt: number }) => boolean;
    if (typeof runId === 'string' && /^[0-9a-z]+$/.test(runId)) {
      match = (u) => synthetic(u.email)?.runId === runId;
      deps.scenarios.delete(runId);
    } else if (typeof olderThanHours === 'number' && olderThanHours >= 0) {
      const cutoff = config.nowS() - olderThanHours * 3600;
      match = (u) => synthetic(u.email) !== null && u.createdAt <= cutoff;
    } else {
      return reply.code(400).send({ error: 'RUN_ID_OR_AGE_REQUIRED' });
    }
    const before = store.rowCount();
    store.deleteUsers(match);
    const after = store.rowCount();
    const residualRows = [...store.users.values()].filter(match).length;
    return { before, after, residualRows };
  });

  /** Fake-only control endpoint: friction scenario for one run. */
  app.put('/__control/scenario/:runId', { preHandler: guard }, async (req, reply) => {
    try {
      deps.scenarios.set((req.params as Record<string, string>).runId as string, resolveScenario(req.body));
      return { ok: true };
    } catch (e) {
      return reply.code(400).send({ error: 'BAD_SCENARIO', message: (e as Error).message });
    }
  });
}
