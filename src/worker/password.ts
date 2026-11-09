// SPDX-License-Identifier: AGPL-3.0-or-later
// Copied from Wattómetro (server/src/password.ts).
/**
 * Password hashing with PBKDF2-SHA256 (Web Crypto, in the Worker).
 * The iteration count is stored with each hash, so it can change later.
 */
import { fromBase64Url, toBase64Url } from './base64url';

export const PASSWORD_ITERATIONS = 100_000; // the most Web Crypto accepts in Workers
export const MIN_PASSWORD_LENGTH = 12;

const encoder = new TextEncoder();

/** Constant-time comparison. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let difference = 0;
  for (let i = 0; i < a.byteLength; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  iterations = PASSWORD_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/** Checked against when the email is unknown, so the answer takes the same time. */
export const DUMMY_HASH = `pbkdf2-sha256$${PASSWORD_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsText, salt, hash] = stored.split('$');
  const iterations = Number(iterationsText);
  if (
    algorithm !== 'pbkdf2-sha256' ||
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > PASSWORD_ITERATIONS ||
    !salt ||
    !hash
  ) {
    return false;
  }
  return sameBytes(await pbkdf2(password, fromBase64Url(salt), iterations), fromBase64Url(hash));
}
