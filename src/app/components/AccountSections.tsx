// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** Settings: the account, the household (who shares the fridge) and the daily alert. */
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  changePassword,
  deleteAccount,
  getHousehold,
  inviteLink,
  joinHousehold,
  leaveHousehold,
  newInviteCode,
  renameHousehold,
  signOut,
  useAccount,
  type HouseholdInfo,
  type Me,
} from '../account';
import { ApiError } from '../api';
import {
  currentSubscription,
  disableAlerts,
  enableAlerts,
  isIos,
  isStandalone,
  pushSupported,
  testAlert,
} from '../push';

const message = (err: unknown) => (err instanceof ApiError ? err.message : 'Algo correu mal.');

export function AccountSections() {
  const account = useAccount();
  if (account.status === 'loading') return null;
  const me = account.me;
  if (!me) {
    return (
      <section className="card">
        <h2>Conta e família</h2>
        <p className="hint">
          Sem conta, tudo fica só neste telemóvel. Com conta, a família vê a mesma despensa, cada um
          recebe o alerta diário e nada se perde se mudares de telemóvel.
        </p>
        <Link className="button primary" to="/conta">
          Criar conta ou entrar
        </Link>
      </section>
    );
  }
  return (
    <>
      <HouseholdSection me={me} />
      <AlertsSection />
      <AccountSection me={me} />
    </>
  );
}

function AccountSection({ me }: { me: Me }) {
  const [open, setOpen] = useState<'password' | 'delete'>();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus(undefined);
    try {
      if (open === 'password') {
        await changePassword(current, next);
        setStatus('Palavra-passe mudada. Os outros dispositivos vão pedir para entrar outra vez.');
      } else {
        await deleteAccount(current);
      }
      setOpen(undefined);
      setCurrent('');
      setNext('');
    } catch (err) {
      setStatus(message(err));
    }
  };

  return (
    <section className="card">
      <h2>Conta</h2>
      <p className="hint">{me.email}</p>
      <div className="row wrap">
        <button type="button" className="secondary" onClick={() => void signOut()}>
          Sair
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setOpen(open === 'password' ? undefined : 'password')}
        >
          Mudar palavra-passe
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setOpen(open === 'delete' ? undefined : 'delete')}
        >
          Apagar conta
        </button>
      </div>
      {open && (
        <form className="form" onSubmit={(event) => void submit(event)}>
          {open === 'delete' && (
            <p className="hint">
              Apaga a conta e, se mais ninguém estiver na tua casa, todos os alimentos guardados.
              Não dá para desfazer.
            </p>
          )}
          <label className="field">
            <span>{open === 'password' ? 'Palavra-passe atual' : 'Palavra-passe'}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </label>
          {open === 'password' && (
            <label className="field">
              <span>Nova palavra-passe</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                value={next}
                onChange={(event) => setNext(event.target.value)}
                required
              />
            </label>
          )}
          <button type="submit" className={open === 'delete' ? 'secondary danger' : 'primary'}>
            {open === 'password' ? 'Mudar palavra-passe' : 'Apagar conta'}
          </button>
        </form>
      )}
      {status && (
        <p className="hint" role="status">
          {status}
        </p>
      )}
    </section>
  );
}

function HouseholdSection({ me }: { me: Me }) {
  const [info, setInfo] = useState<HouseholdInfo>();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<string>();
  const householdId = me.household?.id;

  useEffect(() => {
    let live = true;
    getHousehold()
      .then((household) => {
        if (!live) return;
        setInfo(household);
        setName(household.name);
      })
      .catch((err: unknown) => live && setStatus(message(err)));
    return () => {
      live = false;
    };
  }, [householdId]);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setStatus(undefined);
    try {
      await action();
      const household = await getHousehold();
      setInfo(household);
      setName(household.name);
      if (done) setStatus(done);
    } catch (err) {
      setStatus(message(err));
    }
  };

  const share = async () => {
    if (!info) return;
    const url = inviteLink(info.inviteCode);
    const text = `Junta-te à nossa despensa no Validómetro: ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Validómetro', text, url });
      else {
        await navigator.clipboard.writeText(url);
        setStatus('Link copiado.');
      }
    } catch {
      // Share sheet closed.
    }
  };

  const others = info ? info.members.length - 1 : 0;

  return (
    <section className="card">
      <h2>A tua casa</h2>
      {info && (
        <>
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => renameHousehold(name.trim()), 'Nome guardado.');
            }}
          >
            <input
              aria-label="Nome da casa"
              className="inline-input"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
            {name.trim() && name.trim() !== info.name && (
              <button type="submit" className="ghost">
                Guardar
              </button>
            )}
          </form>
          <ul className="members">
            {info.members.map((member) => (
              <li key={member.email}>
                {member.email}
                {member.you ? ' (tu)' : ''}
              </li>
            ))}
          </ul>
          <p className="hint">
            Para a família ver a mesma despensa, partilha o convite. Código:{' '}
            <strong className="code">{info.inviteCode}</strong>
          </p>
          <div className="row wrap">
            <button type="button" className="primary" onClick={() => void share()}>
              Partilhar convite
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void run(newInviteCode, 'Novo código criado: o antigo deixou de servir.')
              }
            >
              Novo código
            </button>
          </div>
          <form
            className="row join"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => joinHousehold(code), 'Entraste na casa.').then(() => setCode(''));
            }}
          >
            <input
              aria-label="Código de outra casa"
              className="inline-input"
              placeholder="Código de outra casa"
              autoCapitalize="characters"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <button type="submit" className="secondary" disabled={code.trim().length < 4}>
              Juntar-me
            </button>
          </form>
          {others > 0 && (
            <button
              type="button"
              className="ghost"
              onClick={() => void run(leaveHousehold, 'Saíste da casa. Esta despensa é só tua.')}
            >
              Sair desta casa
            </button>
          )}
        </>
      )}
      {status && (
        <p className="hint" role="status">
          {status}
        </p>
      )}
    </section>
  );
}

function AlertsSection() {
  const [on, setOn] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const supported = pushSupported();
  const iphoneOutside = isIos() && !isStandalone();

  useEffect(() => {
    void currentSubscription().then((subscription) => setOn(subscription !== null));
  }, []);

  const run = async (action: () => Promise<void>, done: string, next?: boolean) => {
    setBusy(true);
    setStatus(undefined);
    try {
      await action();
      if (next !== undefined) setOn(next);
      setStatus(done);
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Alerta diário</h2>
      <p className="hint">
        Às 9h, quando houver alimentos a usar, recebes uma notificação. Respondes ali mesmo: Comido,
        Deitado fora ou Ainda tenho, um alimento de cada vez.
      </p>
      {iphoneOutside ? (
        <p className="note">
          No iPhone, as notificações só chegam com o Validómetro no ecrã principal: no Safari, toca
          em Partilhar e depois em “Adicionar ao ecrã principal”, e abre-o a partir daí.
        </p>
      ) : !supported ? (
        <p className="note">Este browser não recebe notificações.</p>
      ) : (
        <div className="row wrap">
          {on ? (
            <>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void run(testAlert, 'Enviado. Deve chegar dentro de segundos.')}
              >
                Enviar um teste
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() =>
                  void run(disableAlerts, 'Alertas desligados neste telemóvel.', false)
                }
              >
                Desligar
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={busy || on === undefined}
              onClick={() => void run(enableAlerts, 'Alertas ligados neste telemóvel.', true)}
            >
              Ligar alertas neste telemóvel
            </button>
          )}
        </div>
      )}
      {status && (
        <p className="hint" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
