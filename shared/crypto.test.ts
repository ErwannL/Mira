import { describe, expect, it } from 'vitest';
import { base36Id, dataKey, decrypt, encrypt, randomPassword, sha256 } from './crypto.js';

const key = dataKey('d'.repeat(32));

describe('crypto', () => {
  it('encrypts at rest with authenticated encryption', () => {
    const c = encrypt('{"password":"x"}', key);
    expect(c).toMatch(/^v1\./);
    expect(c).not.toContain('password');
    expect(decrypt(c, key)).toBe('{"password":"x"}');
    expect(encrypt('a', key)).not.toBe(encrypt('a', key));
  });
  it('rejects tampering, wrong keys and unknown formats', () => {
    const c = encrypt('secret', key);
    const parts = c.split('.');
    parts[3] = Buffer.from('other').toString('base64url');
    expect(() => decrypt(parts.join('.'), key)).toThrow();
    expect(() => decrypt(c, dataKey('e'.repeat(32)))).toThrow();
    expect(() => decrypt('v2.a.b.c', key)).toThrow('Unsupported');
    expect(() => decrypt('v1.a', key)).toThrow('Unsupported');
    expect(() => dataKey('short')).toThrow('at least 32');
  });
  it('hashes, generates passwords and base-36 ids', () => {
    expect(sha256('a')).toHaveLength(64);
    const p = randomPassword();
    expect(p).toMatch(/\d/);
    expect(p.length).toBeGreaterThan(20);
    expect(randomPassword()).not.toBe(p);
    expect(base36Id()).toMatch(/^[0-9a-z]{10}$/);
    expect(base36Id(4)).toHaveLength(4);
  });
});
