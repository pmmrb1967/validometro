// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';

/** A short line about the server: reachable, with D1 bound, or why not. */
export function useHealth(): string {
  const [text, setText] = useState('A verificar a ligação…');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { db: { shelfLifeRules: number } };
        setText(`Ligado · ${body.db.shelfLifeRules} regras de validade`);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('Health check failed', err);
        setText(navigator.onLine ? 'Servidor indisponível' : 'Sem ligação (modo offline)');
      });
    return () => controller.abort();
  }, []);

  return text;
}
