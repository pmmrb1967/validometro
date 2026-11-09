// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import { registerSW } from 'virtual:pwa-register';
import './styles.css';

registerSW({ immediate: true });

const status = document.querySelector<HTMLElement>('#status');
const version = document.querySelector<HTMLElement>('#version');
if (version) version.textContent = __APP_VERSION__;

async function checkHealth(): Promise<void> {
  if (!status) return;
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { db: { shelfLifeRules: number } };
    status.textContent = `Ligado · ${body.db.shelfLifeRules} regras de validade`;
  } catch {
    status.textContent = navigator.onLine ? 'Servidor indisponível' : 'Sem ligação (modo offline)';
  }
}

void checkHealth();
