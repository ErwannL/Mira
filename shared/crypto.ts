import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

/** Derives the 32-byte data key from FIGURA_DATA_KEY (≥ 32 chars). */
export function dataKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error('FIGURA_DATA_KEY must be at least 32 characters');
  return scryptSync(secret, 'figura-data-key-v1', 32);
}

/** AES-256-GCM; output `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), ct].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

export function decrypt(payload: string, key: Buffer): string {
  const [v, iv, tag, ct] = payload.split('.');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unsupported ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Random synthetic password: letters + digits + symbol, never derived from the run seed. */
export function randomPassword(): string {
  return `Fg${randomBytes(18).toString('base64url')}9!`;
}

/** Base-36 id (run ids must be base-36 for synthetic emails). */
export function base36Id(length = 10): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}
