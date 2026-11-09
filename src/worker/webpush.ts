// SPDX-License-Identifier: AGPL-3.0-or-later
// Copied from Wattómetro (server/src/webpush.ts).
/**
 * Web Push from the Worker with WebCrypto only (docs/alerts.md):
 * - the message is encrypted for the device (RFC 8291, aes128gcm, one record),
 *   so the push service carries it without reading it;
 * - the request is signed with the app's VAPID key (RFC 8292, ES256 JWT).
 *
 * Endpoints are only accepted from the browsers' push services
 * (isPushEndpoint): the Worker never posts anywhere else.
 */

import { fromBase64Url, toBase64Url } from './base64url';

const encoder = new TextEncoder();
/** UTF-8 bytes on a plain ArrayBuffer (what the Workers' WebCrypto types ask for). */
const utf8 = (text: string) => new Uint8Array(encoder.encode(text));
const RECORD_SIZE = 4096;
/** Seconds a push service keeps a message for a device that is offline. */
export const PUSH_TTL_SECONDS = 24 * 3600;
const JWT_SECONDS = 12 * 3600;

/** The browsers' push services (Chrome/Android, Safari/iPhone, Firefox, Edge). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** A P-256 private key from its raw scalar and uncompressed public point (base64url). */
function privateJwk(d: string, publicKey: Uint8Array): JsonWebKey {
  return {
    kty: 'EC',
    crv: 'P-256',
    d,
    x: toBase64Url(publicKey.slice(1, 33)),
    y: toBase64Url(publicKey.slice(33, 65)),
    ext: true,
  };
}

export interface PushSubscriptionKeys {
  /** The device's public key, uncompressed P-256 (base64url). */
  p256dh: string;
  /** The device's authentication secret (base64url). */
  auth: string;
}

/** The sender's one-off key pair and salt; random unless a test fixes them. */
export interface EncryptionInputs {
  salt: Uint8Array<ArrayBuffer>;
  publicKey: Uint8Array<ArrayBuffer>;
  privateKey: CryptoKey;
}

async function freshInputs(): Promise<EncryptionInputs> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array(
    (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
  );
  return {
    salt: crypto.getRandomValues(new Uint8Array(16)),
    publicKey,
    privateKey: pair.privateKey,
  };
}

/** Imports a fixed sender key pair (tests: RFC 8291, Appendix A). */
export async function encryptionInputs(
  salt: string,
  publicKey: string,
  privateKey: string,
): Promise<EncryptionInputs> {
  const raw = fromBase64Url(publicKey);
  return {
    salt: fromBase64Url(salt),
    publicKey: raw,
    privateKey: await crypto.subtle.importKey(
      'jwk',
      privateJwk(privateKey, raw),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    ),
  };
}

/** RFC 8291: the body of a push message (header + one aes128gcm record). */
export async function encryptPayload(
  keys: PushSubscriptionKeys,
  plaintext: Uint8Array<ArrayBuffer>,
  inputs?: EncryptionInputs,
): Promise<Uint8Array<ArrayBuffer>> {
  const sender = inputs ?? (await freshInputs());
  const uaPublic = fromBase64Url(keys.p256dh);
  const device = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      // The standard name is `public`; the Workers types spell it `$public`.
      { name: 'ECDH', public: device } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      sender.privateKey,
      256,
    ),
  );
  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, sender.publicKey);
  const ikm = await hkdf(fromBase64Url(keys.auth), ecdhSecret, keyInfo, 32);
  const cek = await hkdf(sender.salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sender.salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // The last (and only) record ends with the 0x02 delimiter.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aes,
      concat(plaintext, new Uint8Array([2])),
    ),
  );
  const header = new Uint8Array(21);
  header.set(sender.salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = sender.publicKey.length;
  return concat(header, sender.publicKey, ciphertext);
}

export interface VapidKeys {
  /** Uncompressed P-256 public key (base64url): the browser's applicationServerKey. */
  publicKey: string;
  /** The private scalar d (base64url); a Worker secret. */
  privateKey: string;
  /** Contact for the push services: "mailto:…". */
  subject: string;
}

/** RFC 8292: the Authorization header for one push service (its origin is the audience). */
export async function vapidAuthorization(
  endpoint: string,
  vapid: VapidKeys,
  now: number,
): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: now + JWT_SECONDS,
        sub: vapid.subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk(vapid.privateKey, fromBase64Url(vapid.publicKey)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // WebCrypto gives r ‖ s, as JWS ES256 wants.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      encoder.encode(`${header}.${claims}`),
    ),
  );
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${vapid.publicKey}`;
}

export interface PushTarget extends PushSubscriptionKeys {
  endpoint: string;
}

/** What the push service said: delivered, gone (forget the device), or failed (try later). */
export type PushResult = 'sent' | 'gone' | 'failed';

export type Fetcher = (url: string, init: RequestInit) => Promise<{ status: number }>;

export async function sendPush(
  target: PushTarget,
  message: unknown,
  vapid: VapidKeys,
  now: number,
  fetcher: Fetcher = fetch,
): Promise<PushResult> {
  if (!isPushEndpoint(target.endpoint)) return 'gone';
  try {
    const body = await encryptPayload(target, utf8(JSON.stringify(message)));
    const response = await fetcher(target.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuthorization(target.endpoint, vapid, now),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(PUSH_TTL_SECONDS),
        Urgency: 'high',
      },
      body,
    });
    if (response.status === 404 || response.status === 410) return 'gone';
    return response.status >= 200 && response.status < 300 ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
