import type { FastifyInstance } from 'fastify';
import { hostnameOf, isLoopbackHost, safeEqual } from '../shared/synthetic.js';

/** Strict CSP; embedding allowed only by the configured admin-console origins. */
export function csp(consoleOrigins: string[]): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    `frame-ancestors ${consoleOrigins.join(' ')}`,
  ].join('; ');
}

/** Exported reports: no script at all, inline styles and data: images only. */
export const REPORT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; sandbox";

/** `Authorization: Bearer <secret>` for the Vigie service API, compared in constant time. */
export function vigieAuthorized(authorization: unknown, secret: string | null): boolean {
  return (
    secret !== null &&
    typeof authorization === 'string' &&
    safeEqual(authorization, `Bearer ${secret}`)
  );
}

export const isVigiePath = (url: string): boolean => url.startsWith('/api/vigie/');

export function securityHooks(
  app: FastifyInstance,
  o: { loopbackOnly: boolean; consoleOrigins: string[]; vigieSecret: string | null },
): void {
  // Loopback lock: a request whose Host is not local gets 404 — the tool does not exist from
  // elsewhere. Sole exception: Vigie's service calls (docker network, `figura-app:4000`) on
  // /api/vigie/* with a valid Bearer.
  app.addHook('onRequest', async (req, reply) => {
    const vigie = isVigiePath(req.url) && vigieAuthorized(req.headers.authorization, o.vigieSecret);
    if (o.loopbackOnly && !vigie && !isLoopbackHost(hostnameOf(String(req.headers.host)))) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  });
  const policy = csp(o.consoleOrigins);
  app.addHook('onSend', async (req, reply, payload) => {
    if (!reply.hasHeader('content-security-policy'))
      reply.header('content-security-policy', policy);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('cross-origin-resource-policy', 'same-origin');
    if (req.url.startsWith('/api') || req.url.startsWith('/auth'))
      reply.header('cache-control', 'no-store');
    return payload;
  });
}
