// No skipped/focused tests and no coverage-bypass tricks.
import { readFileSync } from 'node:fs';
import { repoFiles } from './lib.mjs';

const rules = [
  [/\b(it|test|describe)\.(skip|only|todo)\b|\b(xit|fit|xdescribe|fdescribe)\(/, 'skipped/focused test'],
  [/(istanbul|c8|v8) ignore|pragma: no cover/, 'coverage ignore comment'],
  [/__coverage__/, 'coverage object tampering'],
  [/assert\(true\)|expect\(true\)\.toBe\(true\)/, 'test that cannot fail'],
];
const problems = [];
for (const f of repoFiles().filter((f) => /\.(ts|mjs|js)$/.test(f) && !f.startsWith('scripts/check-tests'))) {
  const text = readFileSync(f, 'utf8');
  for (const [re, what] of rules) if (re.test(text)) problems.push(`${f}: ${what}`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.info('tests ok');
