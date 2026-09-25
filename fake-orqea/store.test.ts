import { describe, expect, it } from 'vitest';
import { checkPassword, hashPassword, Store } from './store.js';

describe('store', () => {
  it('hashes passwords with salt', () => {
    const h = hashPassword('Str0ngPassword');
    expect(h).not.toContain('Str0ng');
    expect(checkPassword('Str0ngPassword', h)).toBe(true);
    expect(checkPassword('wrong', h)).toBe(false);
    expect(hashPassword('a')).not.toBe(hashPassword('a'));
  });
  it('maps tokens to users', () => {
    const s = new Store();
    expect(s.userByToken(undefined)).toBeUndefined();
    expect(s.userByToken('nope')).toBeUndefined();
    expect(s.id('x')).toBe('x1');
  });
});
