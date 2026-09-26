// Ops drift check: compares every catalogue API step with the target's GET /api descriptor (Orqea's
// is a nested tree; every {method, path} leaf counts). Orqea's descriptor is documentation and omits
// some routes, so drift is reported and only fails with --strict (e.g. against the fake Orqea).
// Usage: npm run build && node scripts/drift.mjs [--strict] http://localhost:4100
import { loadCatalogue } from '../dist/shared/loaders.js';
import { flattenEndpoints } from '../dist/worker/target/client.js';
import { checkDrift } from '../dist/worker/target/drift.js';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const target = (
  args.find((a) => a !== '--strict') ??
  process.env.FIGURA_DRIFT_TARGET ??
  'http://localhost:4100'
).replace(/\/$/, '');
const res = await fetch(`${target}/api`);
if (!res.ok) {
  console.error(`GET ${target}/api → ${res.status}`);
  process.exit(1);
}
const report = checkDrift(
  loadCatalogue('catalogue'),
  flattenEndpoints((await res.json()).endpoints),
);
for (const m of report.missing) console.error(`DRIFT ${m.useCase}: ${m.method} ${m.path}`);
for (const u of report.uncatalogued) console.info(`not covered by any use case: ${u}`);
process.exit(strict && report.missing.length > 0 ? 1 : 0);
