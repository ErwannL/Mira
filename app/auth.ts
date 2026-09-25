import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { hmacHex } from '../shared/synthetic.js';
import { sha256 } from '../shared/crypto.js';
import type { AppConfig } from './config.js';
import type { Db } from './db/pool.js';
import { audit, consumeSsoToken, createSession, deleteSession, findSession } from './db/misc.js';
import { verifySsoToken } from './sso.js';

export const SESSION_COOKIE = 'figura_session';

declare module 'fastify' {
  interface FastifyRequest {
    operator: string;
  }
}

export function cookieOptions(cfg: AppConfig) {
  return {
    path: '/',
    httpOnly: true,
    // Same-site console (default): Strict. Console on another site: None + Secure (documented).
    sameSite: cfg.crossSiteCookie ? ('none' as const) : ('strict' as const),
    secure: cfg.crossSiteCookie,
    maxAge: cfg.sessionTtlMinutes * 60,
  };
}

export function authRoutes(app: FastifyInstance, cfg: AppConfig, db: Db, nowS: () => number): void {
  const idHash = (token: string) => hmacHex(cfg.sessionSecret, token);

  app.post('/auth/sso', async (req, reply) => {
    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string' || token.length > 4096) return reply.code(400).send({ error: 'TOKEN_REQUIRED' });
    const r = verifySsoToken(token, { secret: cfg.ssoSecret, appId: cfg.appId, nowS: nowS() });
    if ('error' in r) return reply.code(401).send({ error: r.error });
    if (!(await consumeSsoToken(db, sha256(token), new Date(r.exp * 1000)))) return reply.code(401).send({ error: 'REUSED' });
    const session = randomBytes(32).toString('base64url');
    await createSession(db, idHash(session), r.operator, new Date(Date.now() + cfg.sessionTtlMinutes * 60_000));
    await audit(db, r.operator, 'session.open');
    void reply.setCookie(SESSION_COOKIE, session, cookieOptions(cfg));
    return { operator: r.operator };
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(db, idHash(token));
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  /** Every /api route needs a session; state-changing calls also need the anti-CSRF header. */
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith('/api/')) return;
    const token = req.cookies[SESSION_COOKIE];
    const session = token ? await findSession(db, idHash(token)) : null;
    if (!session) return reply.code(401).send({ error: 'NO_SESSION' });
    if (req.method !== 'GET' && req.headers['x-figura'] !== '1') return reply.code(403).send({ error: 'CSRF_HEADER_REQUIRED' });
    req.operator = session.operator;
  });
}
