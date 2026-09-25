import { createHmac, timingSafeEqual } from 'node:crypto';

export const RUN_HEADER = 'x-synthetic-run';
export const CAPTCHA_HEADER = 'x-captcha-would-show';
export const HEADER_VALIDITY_S = 300;

export function hmacHex(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** `X-Synthetic-Run: <runId>.<ts>.<HMAC-SHA256(runId|ts)>` */
export function signRunHeader(runId: string, secret: string, nowS: number): string {
  return `${runId}.${nowS}.${hmacHex(secret, `${runId}|${nowS}`)}`;
}

/** Returns the runId when the header is authentic and fresh, else null. */
export function verifyRunHeader(
  value: string | undefined,
  secret: string,
  nowS: number,
): string | null {
  const parts = (value ?? '').split('.');
  if (parts.length !== 3) return null;
  const [runId, ts, mac] = parts as [string, string, string];
  if (!/^[0-9a-z]+$/.test(runId) || !/^\d+$/.test(ts)) return null;
  if (Math.abs(nowS - Number(ts)) > HEADER_VALIDITY_S) return null;
  return safeEqual(mac, hmacHex(secret, `${runId}|${ts}`)) ? runId : null;
}

/** synth+<runId>-<personaId>[-<n>]@synthetic.invalid */
export function syntheticEmail(runId: string, personaId: string, n?: number): string {
  return `synth+${runId}-${personaId}${n === undefined ? '' : `-${n}`}@synthetic.invalid`;
}

export function parseSyntheticEmail(email: string): { runId: string; rest: string } | null {
  const m = /^synth\+([0-9a-z]+)-([a-z0-9-]+)@synthetic\.invalid$/.exec(email);
  return m ? { runId: m[1] as string, rest: m[2] as string } : null;
}

export function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    h === 'localhost' || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h) || h === '::ffff:127.0.0.1'
  );
}

/** Hostname part of a Host header ("localhost:4000", "[::1]:80"). */
export function hostnameOf(hostHeader: string): string {
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1);
  return hostHeader.split(':')[0] as string;
}
