import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { loadEnv } from '@wayrune/config';

function keyBytes(): Buffer {
  const env = loadEnv();
  return createHash('sha256').update(env.googleTokenEncryptionKey).digest();
}

/** Encrypt a secret for GoogleConnection storage (AES-256-GCM). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  const [ver, ivB64, tagB64, dataB64] = payload.split(':');
  if (ver !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted secret payload');
  }
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
