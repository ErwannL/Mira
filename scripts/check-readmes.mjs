// Every folder that holds tracked files must have a README.md.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { repoFiles } from './lib.mjs';

const dirs = new Set();
for (const f of repoFiles()) {
  let d = dirname(f);
  while (d !== '.' && d !== '') {
    dirs.add(d);
    d = dirname(d);
  }
}
const missing = [...dirs].filter((d) => !d.startsWith('.') && !existsSync(join(d, 'README.md'))).sort();
if (missing.length) {
  console.error(`Folders without README.md:\n${missing.join('\n')}`);
  process.exit(1);
}
console.info(`readmes ok (${dirs.size} folders)`);
