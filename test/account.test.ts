// SPDX-License-Identifier: AGPL-3.0-or-later
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { Browser, newItem, PASSWORD, signUp, type Me } from './helpers';
import { MAX_LOGIN_FAILURES } from '../src/worker/auth';

describe('accounts', () => {
  it('signs up with its own household and stays signed in', async () => {
    const ana = await signUp('Ana@Example.pt');
    expect(ana.cookie).toMatch(/^__Host-vm_session=/);
    const me = await ana.json<Me>('GET', '/api/auth/me');
    expect(me.user?.email).toBe('ana@example.pt');
    expect(me.user?.household.name).toBe('Casa de ana');
  });

  it('refuses a second account with the same email, and short passwords', async () => {
    const again = await new Browser().request('POST', '/api/auth/register', {
      email: 'ana@example.pt',
      password: PASSWORD,
    });
    expect(again.status).toBe(409);
    const short = await new Browser().request('POST', '/api/auth/register', {
      email: 'curta@example.pt',
      password: 'curta',
    });
    expect(short.status).toBe(400);
  });

  it('signs in and out', async () => {
    const browser = new Browser();
    expect(
      (
        await browser.request('POST', '/api/auth/login', {
          email: 'ana@example.pt',
          password: PASSWORD,
        })
      ).status,
    ).toBe(200);
    expect((await browser.json<Me>('GET', '/api/auth/me')).user).not.toBeNull();
    expect((await browser.request('POST', '/api/auth/logout')).status).toBe(204);
    expect((await browser.json<Me>('GET', '/api/auth/me')).user).toBeNull();
  });

  it('refuses writes from another origin', async () => {
    const res = await new Browser().request(
      'POST',
      '/api/auth/login',
      { email: 'ana@example.pt', password: PASSWORD },
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
  });

  it('locks an email after repeated failures from one address', async () => {
    await signUp('rui@example.pt');
    const browser = new Browser();
    for (let i = 0; i < MAX_LOGIN_FAILURES; i++) {
      const res = await browser.request('POST', '/api/auth/login', {
        email: 'rui@example.pt',
        password: 'errada',
      });
      expect(res.status).toBe(401);
    }
    const locked = await browser.request('POST', '/api/auth/login', {
      email: 'rui@example.pt',
      password: PASSWORD,
    });
    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toBeTruthy();
  });

  it('a password change signs the other devices out', async () => {
    const phone = await signUp('eva@example.pt');
    const laptop = new Browser();
    await laptop.request('POST', '/api/auth/login', {
      email: 'eva@example.pt',
      password: PASSWORD,
    });
    const res = await phone.request('POST', '/api/account/password', {
      current: PASSWORD,
      next: 'outra palavra-passe longa',
    });
    expect(res.status).toBe(204);
    expect((await phone.json<Me>('GET', '/api/auth/me')).user).not.toBeNull();
    expect((await laptop.json<Me>('GET', '/api/auth/me')).user).toBeNull();
  });

  it('keeps the AI key sealed, never in clear', async () => {
    const browser = await signUp('chave@example.pt');
    const res = await browser.request('PUT', '/api/account/ai', {
      provider: 'gemini',
      key: 'AIza-segredo',
    });
    expect(res.status).toBe(204);
    const row = await env.DB.prepare(
      "SELECT ai_provider, ai_key_encrypted FROM users WHERE email = 'chave@example.pt'",
    ).first<{ ai_provider: string; ai_key_encrypted: string }>();
    expect(row?.ai_provider).toBe('gemini');
    expect(row?.ai_key_encrypted).toMatch(/^v1\./);
    expect(row?.ai_key_encrypted).not.toContain('segredo');
    const me = await browser.json<{ user: { ai: { provider: string; hasKey: boolean } } }>(
      'GET',
      '/api/auth/me',
    );
    expect(me.user.ai).toMatchObject({ provider: 'gemini', hasKey: true });
  });
});

describe('households', () => {
  let owner: Browser;
  let code = '';

  beforeAll(async () => {
    owner = await signUp('mae@example.pt');
    code = (await owner.json<{ inviteCode: string }>('GET', '/api/household')).inviteCode;
  });

  it('joins by code, bringing the items of someone alone', async () => {
    const son = await signUp('filho@example.pt');
    const item = newItem('Iogurtes');
    await son.request('POST', '/api/sync', { changes: [item], cursor: 0 });
    const res = await son.request('POST', '/api/household/join', {
      code: code.toLowerCase().replace(/(.{4})/, '$1-'),
    });
    expect(res.status).toBe(200);
    const info = await owner.json<{ members: { email: string }[] }>('GET', '/api/household');
    expect(info.members.map((m) => m.email)).toEqual(['mae@example.pt', 'filho@example.pt']);
    const pulled = await owner.json<{ items: { id: string }[] }>('POST', '/api/sync', {
      changes: [],
      cursor: 0,
    });
    expect(pulled.items.map((i) => i.id)).toContain(item.id);
  });

  it('says so for an unknown code', async () => {
    const someone = await signUp('alguem@example.pt');
    expect(
      (await someone.request('POST', '/api/household/join', { code: 'ZZZZZZZZ' })).status,
    ).toBe(404);
  });

  it("leaves for a household of one's own, the items staying", async () => {
    const son = new Browser();
    await son.request('POST', '/api/auth/login', { email: 'filho@example.pt', password: PASSWORD });
    expect((await son.request('POST', '/api/household/leave')).status).toBe(204);
    const pulled = await son.json<{ items: unknown[] }>('POST', '/api/sync', {
      changes: [],
      cursor: 0,
    });
    expect(pulled.items).toHaveLength(0);
    expect((await son.request('POST', '/api/household/leave')).status).toBe(409);
  });
});
