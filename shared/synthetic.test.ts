import { describe, expect, it } from 'vitest';
import {
  hostnameOf,
  isLoopbackHost,
  parseSyntheticEmail,
  safeEqual,
  signRunHeader,
  syntheticEmail,
  verifyRunHeader,
} from './synthetic.js';

const secret = 's'.repeat(32);

describe('synthetic run header', () => {
  it('round-trips and expires after 5 minutes', () => {
    const h = signRunHeader('abc1', secret, 1000);
    expect(verifyRunHeader(h, secret, 1000)).toBe('abc1');
    expect(verifyRunHeader(h, secret, 1300)).toBe('abc1');
    expect(verifyRunHeader(h, secret, 1301)).toBeNull();
    expect(verifyRunHeader(h, secret, 699)).toBeNull();
  });
  it('rejects forged, malformed and missing headers', () => {
    expect(verifyRunHeader(signRunHeader('abc1', 'x'.repeat(32), 1000), secret, 1000)).toBeNull();
    expect(verifyRunHeader('a.b', secret, 1000)).toBeNull();
    expect(verifyRunHeader('ABC.1000.ff', secret, 1000)).toBeNull();
    expect(verifyRunHeader('abc.x.ff', secret, 1000)).toBeNull();
    expect(verifyRunHeader(undefined, secret, 1000)).toBeNull();
  });
  it('compares in constant time with length check', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'ab')).toBe(false);
  });
});

describe('synthetic emails', () => {
  it('builds and parses', () => {
    expect(syntheticEmail('r1', 'student')).toBe('synth+r1-student@synthetic.invalid');
    expect(syntheticEmail('r1', 'student', 3)).toBe('synth+r1-student-3@synthetic.invalid');
    expect(parseSyntheticEmail('synth+r1-student-3@synthetic.invalid')).toEqual({ runId: 'r1', rest: 'student-3' });
    expect(parseSyntheticEmail('bob@example.com')).toBeNull();
  });
});

describe('hosts', () => {
  it('recognises loopback hosts', () => {
    for (const h of ['localhost', '127.0.0.1', '127.1.2.3', '[::1]', '::1', '::ffff:127.0.0.1']) expect(isLoopbackHost(h)).toBe(true);
    for (const h of ['example.com', '10.0.0.1', 'localhost.evil.com']) expect(isLoopbackHost(h)).toBe(false);
  });
  it('extracts hostnames from Host headers', () => {
    expect(hostnameOf('localhost:4000')).toBe('localhost');
    expect(hostnameOf('[::1]:4000')).toBe('[::1]');
    expect(hostnameOf('example.com')).toBe('example.com');
  });
});
