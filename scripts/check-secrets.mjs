// Light secret scan: private keys, cloud keys, long hex/base64 literals assigned to secret-like names.
import { readFileSync } from 'node:fs';
import { repoFiles } from './lib.mjs';

const rules = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /sk_live_[0-9a-zA-Z]{10,}/,
  /gh[pousr]_[0-9A-Za-z]{30,}/,
  /(SECRET|PASSWORD|TOKEN|KEY)\s*[=:]\s*['"]?[A-Za-z0-9+/_-]{32,}/,
];
const allow = /\.env\.example$|package-lock\.json$|\.test\.ts$|scripts\/check-secrets\.mjs$|e2e\//;
const problems = [];
for (const f of repoFiles().filter((f) => !allow.test(f) && !/\.(png|ico)$/.test(f))) {
  const text = readFileSync(f, 'utf8');
  for (const re of rules) if (re.test(text)) problems.push(`${f}: matches ${re}`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.info('secrets ok');
