// SPDX-License-Identifier: AGPL-3.0-or-later
// Copied from Wattómetro (server/src/webpush.test.ts).
import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url } from '../src/worker/base64url';
import {
  encryptionInputs,
  encryptPayload,
  isPushEndpoint,
  sendPush,
  vapidAuthorization,
} from '../src/worker/webpush';

// RFC 8291, Section 5 and Appendix A (https://www.rfc-editor.org/rfc/rfc8291).
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
};

/** A VAPID key pair made for the test. */
async function testVapid() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return {
    keys: { publicKey: toBase64Url(raw), privateKey: jwk.d as string, subject: 'mailto:a@b.pt' },
    verifyKey: pair.publicKey,
  };
}

describe('Web Push encryption (RFC 8291)', () => {
  it('gives the RFC’s message for its inputs', async () => {
    const inputs = await encryptionInputs(RFC.salt, RFC.asPublic, RFC.asPrivate);
    const body = await encryptPayload(
      { p256dh: RFC.uaPublic, auth: RFC.auth },
      new Uint8Array(new TextEncoder().encode(RFC.plaintext)),
      inputs,
    );
    const header = fromBase64Url(RFC.header);
    expect(toBase64Url(body.slice(0, header.length))).toBe(RFC.header);
    expect(toBase64Url(body.slice(header.length))).toBe(RFC.ciphertext);
  });

  it('uses a fresh salt and key for every message', async () => {
    const keys = { p256dh: RFC.uaPublic, auth: RFC.auth };
    const text = new Uint8Array(new TextEncoder().encode('olá'));
    const a = await encryptPayload(keys, text);
    const b = await encryptPayload(keys, text);
    expect(toBase64Url(a.slice(0, 16))).not.toBe(toBase64Url(b.slice(0, 16)));
    // 86 of header, 4 bytes of "olá", the delimiter and the 16-byte tag.
    expect(a.length).toBe(86 + 4 + 1 + 16);
  });
});

describe('VAPID (RFC 8292)', () => {
  it('signs a JWT for the push service’s origin that the public key verifies', async () => {
    const { keys, verifyKey } = await testVapid();
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
    const header = await vapidAuthorization(endpoint, keys, 1_000);
    const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
    expect(match?.[4]).toBe(keys.publicKey);
    const [, head, claims, signature] = match as RegExpExecArray;
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims as string)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_000 + 12 * 3600,
      sub: 'mailto:a@b.pt',
    });
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      fromBase64Url(signature as string),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe('sending', () => {
  it('only to the browsers’ push services', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QGx')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isPushEndpoint('https://example.com/push')).toBe(false);
  });

  it('posts the encrypted message and reads what the service says', async () => {
    const { keys } = await testVapid();
    const target = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/x',
      p256dh: RFC.uaPublic,
      auth: RFC.auth,
    };
    const calls: { url: string; init: RequestInit }[] = [];
    const answer = (status: number) => async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return { status };
    };
    expect(await sendPush(target, { title: 't' }, keys, 0, answer(201))).toBe('sent');
    expect(await sendPush(target, { title: 't' }, keys, 0, answer(410))).toBe('gone');
    expect(await sendPush(target, { title: 't' }, keys, 0, answer(503))).toBe('failed');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.Authorization).toMatch(/^vapid t=/);
    // Never anywhere else.
    expect(
      await sendPush({ ...target, endpoint: 'https://example.com/x' }, {}, keys, 0, answer(201)),
    ).toBe('gone');
    expect(calls).toHaveLength(3);
  });
});
