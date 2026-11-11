// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "O que cozinhar hoje?": the red and amber items go to the AI, 2–3 simple recipes come back.
 * Only when asked (a tap on the tab must not spend the AI); kept for the session, so going
 * back and forth shows them again without asking.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
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

  /** "Sugerir receitas" / "Outras ideias" / "Tentar outra vez": only on a tap. */
  const ask = async () => {
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
      <h1 className="page-title">O que cozinhar hoje?</h1>
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
          {busy && (
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
              className={shown ? 'secondary' : undefined}
              disabled={busy}
              onClick={() => void ask()}
            >
              {shown ? 'Outras ideias' : error ? 'Tentar outra vez' : 'Sugerir receitas'}
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
