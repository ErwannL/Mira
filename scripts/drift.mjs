// CI/ops drift check: compares every catalogue API step with the target's GET /api endpoint list.
// Usage: npm run build && node scripts/drift.mjs http://localhost:4100
import { loadCatalogue } from '../dist/shared/loaders.js';
import { checkDrift } from '../dist/worker/target/drift.js';

const target = (
  process.argv[2] ??
  process.env.FIGURA_DRIFT_TARGET ??
  'http://localhost:4100'
).replace(/\/$/, '');
const res = await fetch(`${target}/api`);
if (!res.ok) {
  console.error(`GET ${target}/api → ${res.status}`);
  process.exit(1);
}
const { endpoints } = await res.json();
const report = checkDrift(loadCatalogue('catalogue'), endpoints);
for (const m of report.missing) console.error(`DRIFT ${m.useCase}: ${m.method} ${m.path}`);
for (const u of report.uncatalogued) console.info(`not covered by any use case: ${u}`);
process.exit(report.missing.length > 0 ? 1 : 0);
