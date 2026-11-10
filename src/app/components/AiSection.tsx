// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** Settings: who reads receipts, printed dates and dictated lists. */
import { useId, useState } from 'react';
import { saveAccountAi, useAccount } from '../account';
import { ApiError, testAi } from '../api';
import {
  CLAUDE_MODEL_OPTIONS,
  saveAiSettings,
  useAiSettings,
  type AiProviderChoice,
} from '../ai-settings';
import { PasswordField } from './PasswordField';

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

export function AiSection() {
  const ids = useId();
  const settings = useAiSettings();
  const [status, setStatus] = useState<string>();
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
      setStatus(forget ? 'Chave apagada da conta.' : 'Guardada na conta, cifrada.');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Não foi possível guardar.');
    }
  };

  const test = async () => {
    setTesting(true);
    setStatus('A testar…');
    try {
      await testAi();
      setStatus('Ligação a funcionar.');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'A ligação falhou.');
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
            savedKey ? 'Guardada na conta' : provider === 'anthropic' ? 'sk-ant-…' : 'AIza…'
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
      {status && (
        <p className="hint" role="status">
          {status}
        </p>
      )}
      <p className="hint">
        {me
          ? 'Guardada na conta, a chave fica cifrada no servidor e serve em todos os teus telemóveis. Se não a guardares, fica só neste e vai com cada leitura.'
          : 'A chave fica só neste telemóvel e vai com cada leitura; o servidor usa-a nesse pedido e não a guarda.'}{' '}
        As fotos são lidas e apagadas logo a seguir: nunca ficam guardadas.
      </p>
    </section>
  );
}
