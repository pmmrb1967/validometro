// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "O que jantar hoje?": the red and amber items go to the AI, 2–3 simple recipes come back.
 * Kept for the session only, so going back and forth does not ask (and spend) again.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { lisbonDate } from '../../domain/dates';
import { bySoonest, light } from '../../domain/traffic-light';
import { ApiError, suggestRecipes, type Recipe } from '../api';
import { activeItems } from '../store/items';

const CACHE = 'validometro.recipes';
const MAX_ITEMS = 12;

interface Cached {
  key: string;
  recipes: Recipe[];
}

function readCache(key: string): Recipe[] | undefined {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE) ?? 'null') as Cached | null;
    return cached?.key === key ? cached.recipes : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, recipes: Recipe[]): void {
  try {
    sessionStorage.setItem(CACHE, JSON.stringify({ key, recipes } satisfies Cached));
  } catch {
    // Private mode: it just asks again next time.
  }
}

export function Recipes() {
  const items = useLiveQuery(() => activeItems(), []);
  const today = lisbonDate(new Date());
  const due = useMemo(
    () =>
      (items ?? [])
        .map((item) => light(item, today))
        .filter((lit) => !lit.longLife && (lit.light === 'red' || lit.light === 'amber'))
        .sort(bySoonest)
        .slice(0, MAX_ITEMS)
        .map((lit) => ({ name: lit.item.name, days: lit.daysLeft ?? 0 })),
    [items, today],
  );
  const key = due.map((item) => `${item.name}:${item.days}`).join('|');
  const [recipes, setRecipes] = useState<Recipe[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Asked earlier in this session for the same items: shown again, without asking.
  const cached = useMemo(() => readCache(key), [key]);
  const shown = recipes ?? cached;

  const failed = (err: unknown) =>
    err instanceof ApiError ? err.message : 'Não foi possível pensar em receitas.';

  // First visit with these items: ask once.
  useEffect(() => {
    if (items === undefined || due.length === 0 || shown || error) return;
    let live = true;
    suggestRecipes(due)
      .then((answer) => {
        writeCache(key, answer.recipes);
        if (live) setRecipes(answer.recipes);
      })
      .catch((err: unknown) => {
        if (live) setError(failed(err));
      });
    return () => {
      live = false;
    };
  }, [items, due, key, shown, error]);

  /** "Outras ideias" / "Tentar outra vez". */
  const askAgain = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const answer = await suggestRecipes(due);
      setRecipes(answer.recipes);
      writeCache(key, answer.recipes);
    } catch (err) {
      setError(failed(err));
    } finally {
      setBusy(false);
    }
  };

  if (items === undefined) return null;

  return (
    <div className="recipes">
      <h1 className="page-title">O que jantar hoje?</h1>
      {due.length === 0 ? (
        <>
          <p className="hint">
            Nada está a acabar a validade esta semana. Quando houver, aqui aparecem ideias para o
            aproveitar.
          </p>
          <Link className="button secondary" to="/">
            Voltar ao início
          </Link>
        </>
      ) : (
        <>
          <p className="hint">
            Ideias com o que acaba primeiro: {due.map((item) => item.name).join(', ')}.
          </p>
          {!shown && !error && (busy || due.length > 0) && (
            <p className="hint" role="status">
              A pensar em receitas…
            </p>
          )}
          {error && (
            <p className="note error" role="alert">
              {error}
            </p>
          )}
          {shown?.map((recipe) => (
            <article key={recipe.title} className="card recipe">
              <h2>{recipe.title.charAt(0).toUpperCase() + recipe.title.slice(1)}</h2>
              <p className="hint">
                {recipe.minutes} minutos. Usa {recipe.usa.join(', ') || 'o que tens'}.
                {recipe.falta.length > 0 && ` Falta: ${recipe.falta.join(', ')}.`}
              </p>
              <ol>
                {recipe.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </article>
          ))}
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void askAgain()}
            >
              {shown ? 'Outras ideias' : 'Tentar outra vez'}
            </button>
          </div>
          <p className="hint">
            As receitas são sugeridas pela IA escolhida nas definições. Confirma sempre o estado dos
            alimentos antes de cozinhar.
          </p>
        </>
      )}
    </div>
  );
}
