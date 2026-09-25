import { join } from 'node:path';
import { repoRoot } from '../shared/paths.js';
import { loadSimData } from '../worker/data.js';
import { appConfigFromEnv } from './config.js';
import { createPool, migrate } from './db/pool.js';
import { buildApp } from './server.js';

type Env = Record<string, string | undefined>;

export async function start(env: Env, logger = true) {
  const root = repoRoot();
  const cfg = appConfigFromEnv(env, { uiDir: join(root, 'dist', 'ui') });
  const db = createPool(cfg.databaseUrl);
  await migrate(db, join(root, 'app', 'db', 'migrations'));
  const app = await buildApp(cfg, { db, data: loadSimData(root), nowS: () => Math.floor(Date.now() / 1000), logger, ownsDb: true });
  await app.listen({ port: cfg.port, host: cfg.host });
  return app;
}
