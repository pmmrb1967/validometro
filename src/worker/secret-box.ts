// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro (server/src/secret-box.ts).
/**
 * Encrypts a user's secret (the AI key) for storage in D1, as ifanalysis does:
 * AES-256-GCM with a key derived (HKDF-SHA256) from the Worker secret
 * KEY_ENCRYPTION_SECRET, which never reaches the database. A copy of the database alone
 * does not reveal the key. The user's id is the additional data, so a sealed
 * value only opens for the user it was sealed for.
 *
 * Format: "v1.<iv>.<ciphertext>" (base64url), versioned so the scheme can change.
 */
import { fromBase64Url, toBase64Url } from './base64url';

/** As SESSION_SECRET: at least 32 random characters. */
export const MIN_SECRET_LENGTH = 32;
const VERSION = 'v1';
const IV_BYTES = 12;

const encoder = new TextEncoder();

async function aesKey(secret: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode('validometro ai-key v1'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(secret: string, plaintext: string, owner: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(owner) },
    await aesKey(secret),
    encoder.encode(plaintext),
  );
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** The plaintext, or null when the value is not one sealed with this secret for this owner. */
export async function open(secret: string, sealed: string, owner: string): Promise<string | null> {
  const [version, iv, ciphertext] = sealed.split('.');
  if (version !== VERSION || !iv || !ciphertext) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(iv), additionalData: encoder.encode(owner) },
      await aesKey(secret),
      fromBase64Url(ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
