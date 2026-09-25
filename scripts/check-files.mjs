// Enforces: files ≤ 1000 lines, LF endings, no BOM, final newline.
import { existsSync, readFileSync } from 'node:fs';
import { repoFiles } from './lib.mjs';

const TEXT =
  /\.(ts|mjs|js|json|md|yml|yaml|css|html|svg|sql|txt|sh)$|Dockerfile|\.env\.example|\.gitattributes|\.gitignore$/;
const SKIP = /^package-lock\.json$/;
const problems = [];
for (const file of repoFiles()) {
  if (!TEXT.test(file) || SKIP.test(file) || !existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (text.includes('\r')) problems.push(`${file}: CRLF line ending`);
  if (text.charCodeAt(0) === 0xfeff) problems.push(`${file}: BOM`);
  const lines = text.split('\n').length - 1;
  if (lines > 1000) problems.push(`${file}: ${lines} lines (> 1000)`);
  if (text.length > 0 && !text.endsWith('\n')) problems.push(`${file}: no final newline`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.info('files ok');
