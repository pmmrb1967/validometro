// SPDX-License-Identifier: AGPL-3.0-or-later
// "Regras de validade": the household's own days, kept per household and sent with every
// sync (src/worker/rules.ts).
import { describe, expect, it } from 'vitest';
import { Browser, signUp } from './helpers';

const MILK = { category: 'leite_fresco', location: 'frigorifico', state: 'fechado' };

describe('household shelf-life rules', () => {
  it('saves, changes and resets a rule, for the household only', async () => {
    const ana = await signUp('regras-ana@example.pt');
    const rui = await signUp('regras-rui@example.pt');
    expect((await ana.request('PUT', '/api/household/rules', { ...MILK, days: 3 })).status).toBe(
      204,
    );
    expect((await ana.request('PUT', '/api/household/rules', { ...MILK, days: 2 })).status).toBe(
      204,
    );
    expect(await ana.json('GET', '/api/household/rules')).toEqual({
      overrides: [{ ...MILK, days: 2 }],
    });
    // Another household does not see it.
    expect(await rui.json('GET', '/api/household/rules')).toEqual({ overrides: [] });

    // Every sync brings the household's rules.
    const synced = await ana.json<{ rules: unknown[] }>('POST', '/api/sync', {
      changes: [],
      cursor: 0,
    });
    expect(synced.rules).toEqual([{ ...MILK, days: 2 }]);

    await ana.request('PUT', '/api/household/rules', { ...MILK, days: null });
    expect(await ana.json('GET', '/api/household/rules')).toEqual({ overrides: [] });
  });

  it('refuses long-life rules, unknown rules, odd days and no account', async () => {
    const ana = await signUp('regras-recusa@example.pt');
    const put = (body: unknown) => ana.request('PUT', '/api/household/rules', body);
    expect(
      (await put({ category: 'longa_duracao', location: 'despensa', state: 'fechado', days: 9 }))
        .status,
    ).toBe(400);
    expect((await put({ ...MILK, category: 'inventada', days: 3 })).status).toBe(400);
    expect((await put({ ...MILK, days: -1 })).status).toBe(400);
    expect((await put({ ...MILK, days: 2.5 })).status).toBe(400);
    expect((await new Browser().request('GET', '/api/household/rules')).status).toBe(401);
  });
});
