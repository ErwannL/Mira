import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { mintSsoToken, SSO_TTL_S } from '../shared/jwt.js';
import { isLoopbackHost } from '../shared/synthetic.js';
import type { Deps } from './context.js';
import { esc } from './html.js';

/**
 * A tiny stand-in for the Orqea admin console: it mints a 60 s SSO token and embeds the simulator
 * in an iframe (`<app>/#sso=<token>`), with the fallback link and "open in new tab" the contract asks for.
 */
export function consolePages(app: FastifyInstance, deps: Deps): void {
  const { config } = deps;
  const localOnly = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isLoopbackHost(req.ip) && !config.adminAllowed.some((p) => req.ip.startsWith(p))) {
      return reply.code(404).send({ error: 'NOT_FOUND' });
    }
  };
  const token = () =>
    mintSsoToken(config.ssoSecret, config.appId, 'Fake console operator', config.nowS());
  const appLink = () => `${config.appUrl}/#sso=${token()}`;

  app.get('/console/token', { preHandler: localOnly }, async () => ({
    token: token(),
    expiresIn: SSO_TTL_S,
  }));
  app.get('/console/open', { preHandler: localOnly }, async (_req, reply) =>
    reply.redirect(appLink()),
  );
  app.get('/console', { preHandler: localOnly }, async (_req, reply) => {
    const src = esc(appLink());
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Orqea admin console (fake)</title>
<style>body{margin:0;background:#0f1115;color:#e6e8ee;font-family:system-ui}iframe{border:0;width:100%;height:calc(100vh - 3rem)}header{height:3rem;display:flex;gap:1rem;align-items:center;padding:0 1rem}a{color:#7cc4ff}</style></head>
<body><header><strong>Orqea admin · Synthetic users</strong><a href="/console/open" target="_blank" rel="noopener">Open in new tab</a>
<a id="fallback" href="/console/open" target="_blank" rel="noopener" hidden>The simulator did not load — open it directly</a></header>
<iframe id="app" title="Synthetic users simulator" src="${src}"></iframe>
<script>(function(){var loaded=false;document.getElementById('app').addEventListener('load',function(){loaded=true});setTimeout(function(){if(!loaded)document.getElementById('fallback').hidden=false},8000)})();</script>
</body></html>`;
    return reply.type('text/html').send(html);
  });
}
