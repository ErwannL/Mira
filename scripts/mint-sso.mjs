// Dev helper: mints a valid 60 s SSO token from .env and prints the URL to open (no console needed).
// Usage: npm run sso:mint [-- "Operator name" [target]]  (target: the Orqea environment, e.g. local)
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const env = { ...process.env };
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}
const secret = env.FIGURA_SSO_SECRET ?? '';
if (secret.length < 32) {
  console.error('FIGURA_SSO_SECRET (≥ 32 chars) is required in the environment or .env');
  process.exit(1);
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'orqea-admin-console', aud: env.FIGURA_APP_ID ?? 'figura', operator: process.argv[2] ?? 'Local developer', target: process.argv[3], jti: randomBytes(12).toString('base64url'), iat: now, exp: now + 60 })}`;
const token = `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
console.info(`${env.FIGURA_PUBLIC_URL ?? 'http://localhost:4000'}/#sso=${token}`);
