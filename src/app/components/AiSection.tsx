// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** Settings: who reads receipts, printed dates and dictated lists. */
import { useEffect, useId, useState } from 'react';
import { costUsd, formatUsd } from '../../domain/ai-cost';
import { call, saveAccountAi, useAccount } from '../account';
import { ApiError, testAi } from '../api';
import {
  CLAUDE_MODEL_OPTIONS,
  saveAiSettings,
  useAiSettings,
  type AiProviderChoice,
} from '../ai-settings';
import { AiCostNote } from './AiCostNote';
import { PasswordField } from './PasswordField';
import { here } from '../device';

const OPTIONS: { id: AiProviderChoice; label: string; hint: string }[] = [
  {
    id: 'workers-ai',
    label: 'Gratuita (Workers AI)',
    hint: 'Sem chave nem conta. Há um limite diário partilhado: se esgotar, usa a tua chave ou escreve à mão.',
  },
  {
    id: 'gemini',
    label: 'Gemini, com a tua chave',
    hint: 'Cria uma chave em aistudio.google.com (tem um plano gratuito).',
  },
  {
    id: 'anthropic',
    label: 'Claude, com a tua chave',
    hint: 'Cria uma chave em platform.claude.com. Cada leitura é paga pela tua conta.',
  },
];

/** What "Testar ligação" or "Guardar na conta" said: green when it worked, red when not. */
interface Status {
  kind: 'ok' | 'error' | 'busy';
  text: string;
}

const failure = (err: unknown, fallback: string): Status => ({
  kind: 'error',
  text: err instanceof ApiError ? err.message : fallback,
});

interface MyUsage {
  days: number;
  rows: {
    provider: string;
    model: string | null;
    calls: number;
    input: number;
    output: number;
    unpriced: number;
  }[];
}

/** Signed in: what this person's own key spent lately (counted by the app, not a bill). */
function MyKeyUsage() {
  const [usage, setUsage] = useState<MyUsage>();
  useEffect(() => {
    let live = true;
    call<MyUsage>('GET', '/api/ai/my-usage')
      .then((next) => live && setUsage(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!usage) return null;
  const own = usage.rows.filter((row) => row.provider !== 'workers-ai');
  const calls = own.reduce((sum, row) => sum + row.calls, 0);
  if (calls === 0) {
    return <p className="hint">Nos últimos {usage.days} dias não usaste a tua chave.</p>;
  }
  const usd = own.reduce(
    (sum, row) => sum + (costUsd(row.model, { input: row.input, output: row.output }) ?? 0),
    0,
  );
  const unpriced = own.some((row) => row.unpriced > 0);
  return (
    <p className="hint">
      Nos últimos {usage.days} dias, com a tua chave: {calls} {calls === 1 ? 'pedido' : 'pedidos'},
      ≈ <strong>{formatUsd(usd)}</strong>
      {unpriced && ' (sem contar os mais antigos, de antes desta contagem)'}. É uma estimativa pelos
      preços de tabela; o valor certo está na tua conta do fornecedor.
    </p>
  );
}

export function AiSection() {
  const ids = useId();
  const settings = useAiSettings();
  const [status, setStatus] = useState<Status>();
  const [testing, setTesting] = useState(false);
  const provider = settings.provider;
  const needsKey = provider !== 'workers-ai';
  const account = useAccount();
  const me = account.status === 'ready' ? account.me : null;
  const savedKey = me?.ai.provider === provider && me.ai.hasKey;
  const localKey = provider === 'workers-ai' ? undefined : settings.keys[provider];

  const saveToAccount = async (forget = false) => {
    setStatus(undefined);
    try {
      await saveAccountAi({
        provider,
        key: forget ? '' : localKey,
        model: provider === 'anthropic' ? settings.claudeModel : null,
      });
      if (!forget) {
        // The account has it now: no copy needed on this phone.
        saveAiSettings({ ...settings, keys: { ...settings.keys, [provider]: '' } });
      }
      setStatus({
        kind: 'ok',
        text: forget ? 'Chave apagada da conta.' : 'Guardada na conta, cifrada.',
      });
    } catch (err) {
      setStatus(failure(err, 'Não foi possível guardar.'));
    }
  };

  const test = async () => {
    setTesting(true);
    setStatus({ kind: 'busy', text: 'A testar…' });
    try {
      await testAi();
      setStatus({ kind: 'ok', text: 'Ligação a funcionar.' });
    } catch (err) {
      setStatus(failure(err, 'A ligação falhou.'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="card">
      <h2>Leitura de talões e datas</h2>
      <fieldset className="field">
        <legend>Quem lê</legend>
        <div className="choices">
          {OPTIONS.map((option) => (
            <label key={option.id} className="choice">
              <input
                type="radio"
                name={`${ids}-provider`}
                checked={provider === option.id}
                onChange={() => {
                  saveAiSettings({ ...settings, provider: option.id });
                  setStatus(undefined);
                }}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {needsKey && (
        <PasswordField
          label="Chave da API"
          what="a chave"
          autoComplete="off"
          spellCheck={false}
          value={localKey ?? ''}
          placeholder={
            savedKey
              ? (me?.ai.keyHint ?? 'Guardada na conta')
              : provider === 'anthropic'
                ? 'sk-ant-…'
                : 'AIza…'
          }
          onChange={(event) => {
            saveAiSettings({
              ...settings,
              keys: { ...settings.keys, [provider]: event.target.value.trim() },
            });
            setStatus(undefined);
          }}
        />
      )}

      {provider === 'anthropic' && (
        <label className="field">
          <span>Modelo</span>
          <select
            value={settings.claudeModel}
            onChange={(event) => saveAiSettings({ ...settings, claudeModel: event.target.value })}
          >
            {CLAUDE_MODEL_OPTIONS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="row">
        <button
          type="button"
          className="secondary"
          disabled={testing || (needsKey && !localKey && !savedKey)}
          onClick={() => void test()}
        >
          Testar ligação
        </button>
        {me && needsKey && localKey && (
          <button type="button" className="ghost" onClick={() => void saveToAccount()}>
            Guardar na conta
          </button>
        )}
        {me && needsKey && savedKey && !localKey && (
          <button type="button" className="ghost" onClick={() => void saveToAccount(true)}>
            Apagar da conta
          </button>
        )}
      </div>
      <AiCostNote operation="receipt" />
      {needsKey &&
        (me ? (
          <MyKeyUsage />
        ) : (
          <p className="hint">
            Sem conta, a app não sabe de quem é cada pedido: o gasto da chave vê-se na conta do
            fornecedor.
          </p>
        ))}
      {savedKey && !localKey && me?.ai.keyHint && (
        <p className="hint">Chave guardada na conta, terminada em {me.ai.keyHint.slice(-4)}.</p>
      )}
      {status && (
        <p
          className={`hint status-${status.kind}`}
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          {status.kind === 'ok' && '✓ '}
          {status.kind === 'error' && '✗ '}
          {status.text}
        </p>
      )}
      <p className="hint">
        {me
          ? 'Guardada na conta, a chave fica cifrada no servidor e serve em todos os teus telemóveis. Se não a guardares, fica só neste e vai com cada leitura.'
          : `A chave fica só ${here()} e vai com cada leitura; o servidor usa-a nesse pedido e não a guarda.`}{' '}
        As fotos são lidas e apagadas logo a seguir: nunca ficam guardadas.
      </p>
    </section>
  );
}
