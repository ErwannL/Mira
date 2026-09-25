import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { adminApi } from './api/admin.js';
import { authApi } from './api/auth.js';
import { productApi } from './api/product.js';
import { clientScript } from './client/app.js';
import { consolePages } from './console.js';
import { ctxOf, type Deps, type FakeConfig } from './context.js';
import { CSS } from './html.js';
import { appPages } from './pages/app.js';
import { boardPages } from './pages/board.js';
import { publicPages } from './pages/public.js';
import { ScenarioRegistry, type Scenario } from './scenario.js';
import { Store } from './store.js';

export interface FakeOrqea {
  app: FastifyInstance;
  deps: Deps;
}

export async function buildFakeOrqea(config: FakeConfig, defaultScenario: Scenario): Promise<FakeOrqea> {
  const app = Fastify({ logger: false, trustProxy: false });
  const deps: Deps = { config, store: new Store(), scenarios: new ScenarioRegistry(defaultScenario) };
  await app.register(cookie);

  const endpoints: { method: string; path: string }[] = [];
  app.addHook('onRoute', (route) => {
    const methods = ([] as string[]).concat(route.method).filter((m) => m !== 'HEAD');
    if (route.url.startsWith('/api')) methods.forEach((method) => endpoints.push({ method, path: route.url }));
  });
  app.addHook('onRequest', async (req) => {
    const slow = ctxOf(req, deps).scenario.slowMs;
    if (slow > 0 && !req.url.startsWith('/api/admin') && !req.url.startsWith('/static')) {
      await new Promise((r) => setTimeout(r, slow));
    }
  });

  app.get('/health', async () => ({ ok: true }));
  app.get('/static/app.js', async (_req, reply) => reply.type('text/javascript').send(clientScript()));
  app.get('/static/app.css', async (_req, reply) => reply.type('text/css').send(CSS));
  app.get('/api', async () => ({ endpoints }));
  authApi(app, deps);
  productApi(app, deps);
  adminApi(app, deps);
  publicPages(app, deps);
  boardPages(app, deps);
  appPages(app, deps);
  consolePages(app, deps);
  await app.ready();
  return { app, deps };
}
