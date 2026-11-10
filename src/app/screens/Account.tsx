// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * Sign in or create an account. An invite link (/conta?convite=CODE) joins that household
 * right after; what is already on this phone goes to the account (sync.ts).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { joinHousehold, register, signIn, useAccount } from '../account';
import { ApiError } from '../api';
import { PasswordField } from '../components/PasswordField';

const MIN_PASSWORD = 12;

export function Account({ initialMode }: { initialMode?: 'entrar' | 'criar' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invite = params.get('convite')?.trim() ?? '';
  const account = useAccount();
  const me = account.status === 'ready' ? account.me : null;
  const [mode, setMode] = useState<'entrar' | 'criar'>(
    initialMode ?? (invite ? 'criar' : 'entrar'),
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Signed in already and nothing to join: straight to the app.
  useEffect(() => {
    if (me && !invite) navigate('/', { replace: true });
  }, [me, invite, navigate]);

  const join = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await joinHousehold(invite);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar na casa.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      if (mode === 'criar') await register(email, password);
      else await signIn(email, password);
      if (invite) await joinHousehold(invite);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Algo correu mal. Tenta outra vez.');
    } finally {
      setBusy(false);
    }
  };

  if (me && invite) {
    return (
      <div className="account">
        <h1 className="page-title">Juntar-me a uma casa</h1>
        <p className="hint">
          Recebeste um convite para partilhar a despensa. Ao entrar, passas a ver os alimentos dessa
          casa{me.household ? ` em vez dos de “${me.household.name}”` : ''}. Se mais ninguém estava
          na tua casa, os teus alimentos vão contigo.
        </p>
        <div className="form-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void join()}>
            Juntar-me
          </button>
          <Link className="button ghost" to="/definicoes">
            Agora não
          </Link>
        </div>
        {error && (
          <p className="note error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="account">
      <h1 className="page-title">{mode === 'criar' ? 'Criar conta' : 'Entrar'}</h1>
      <p className="hint">
        {invite
          ? 'Recebeste um convite para uma casa. Cria uma conta (ou entra) para veres a mesma despensa.'
          : 'Com conta, a família vê a mesma despensa e cada um recebe o alerta diário. O que já registaste neste telemóvel passa para a conta.'}
      </p>

      <div className="segmented account-mode">
        {(['entrar', 'criar'] as const).map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="account-mode"
              checked={mode === option}
              onChange={() => {
                setMode(option);
                setError(undefined);
              }}
            />
            <span>{option === 'entrar' ? 'Já tenho conta' : 'Criar conta'}</span>
          </label>
        ))}
      </div>

      <form className="form" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <PasswordField
          label="Palavra-passe"
          autoComplete={mode === 'criar' ? 'new-password' : 'current-password'}
          minLength={mode === 'criar' ? MIN_PASSWORD : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          hint={
            mode === 'criar' && (
              <small className="hint">Pelo menos {MIN_PASSWORD} caracteres. Uma frase serve.</small>
            )
          }
        />
        <div className="form-actions">
          <button type="submit" className="primary" disabled={busy}>
            {mode === 'criar' ? 'Criar conta' : 'Entrar'}
          </button>
        </div>
        {error && (
          <p className="note error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
