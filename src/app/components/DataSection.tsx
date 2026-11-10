// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** "Os teus dados": what is kept where, the file with all of it, and (no account) erasing it. */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAccount } from '../account';
import { downloadMyData, eraseThisDevice } from '../my-data';

export function DataSection() {
  const account = useAccount();
  const signedIn = account.status === 'ready' && Boolean(account.me);
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    setStatus(undefined);
    try {
      await downloadMyData();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Algo correu mal.');
    } finally {
      setBusy(false);
    }
  };

  const erase = async () => {
    await eraseThisDevice();
    void navigate('/', { replace: true });
  };

  return (
    <section className="card">
      <h2>Os teus dados</h2>
      <p className="hint">
        Sem conta, tudo o que registas fica só neste telemóvel (ou computador). Com conta, os
        alimentos ficam também no servidor, visíveis só para quem está na tua casa. Ao servidor vão
        o código de barras, quando procuras um produto, e as fotos ou o que ditas, para serem lidos;
        nada disso fica guardado. O servidor aprende as abreviaturas dos talões que confirmas (ex.:
        "IOG NAT" é iogurte natural), sem saber de quem são.{' '}
        <Link to="/privacidade">Mais sobre privacidade</Link>.
      </p>
      <div className="row wrap">
        <button type="button" className="secondary" disabled={busy} onClick={() => void download()}>
          {busy ? 'A preparar…' : 'Descarregar os meus dados'}
        </button>
        {!signedIn && !confirming && (
          <button type="button" className="ghost" onClick={() => setConfirming(true)}>
            Apagar os dados deste telemóvel
          </button>
        )}
      </div>
      <p className="hint">
        {signedIn
          ? 'Um ficheiro com a conta, a casa, os alimentos e a lista de compras. Para apagar tudo do servidor, usa “Apagar conta”, acima.'
          : 'Um ficheiro com os alimentos e a lista de compras deste telemóvel.'}
      </p>
      {confirming && (
        <div role="group" aria-label="Confirmar">
          <p className="hint">
            Apaga todos os alimentos e a lista de compras deste telemóvel. Não dá para desfazer.
          </p>
          <div className="row wrap">
            <button type="button" className="secondary danger" onClick={() => void erase()}>
              Apagar tudo
            </button>
            <button type="button" className="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {status && (
        <p className="note error" role="alert">
          {status}
        </p>
      )}
    </section>
  );
}
