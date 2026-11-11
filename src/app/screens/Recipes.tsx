// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "O que cozinhar hoje?": the red and amber items go to the AI, 2–3 simple recipes come back.
 * Only when asked (a tap on the tab must not spend the AI). Every suggestion is kept with the
 * items it was for (store/recipes.ts): seen again later without asking, shared at home, and
 * reached from each item's card ("2 receitas", /receitas?alimento=<id>).
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { lisbonDate } from '../../domain/dates';
import { groupRecipes, PAST_DAYS, type SavedRecipe } from '../../domain/recipes';
import { bySoonest, light } from '../../domain/traffic-light';
import type { Item } from '../../domain/types';
import { ApiError, suggestRecipes } from '../api';
import { AiCostNote } from '../components/AiCostNote';
import { activeItems } from '../store/items';
import {
  keepSuggestions,
  madeRecipe,
  removeRecipe,
  savedRecipes,
  starRecipe,
} from '../store/recipes';

const MAX_ITEMS = 12;

function RecipeCard({
  recipe,
  active,
  open = true,
}: {
  recipe: SavedRecipe;
  active: ReadonlyMap<string, Item>;
  open?: boolean;
}) {
  const [finishing, setFinishing] = useState(false);
  const usedHere = recipe.item_ids.flatMap((id) => {
    const item = active.get(id);
    return item ? [item] : [];
  });
  const [eaten, setEaten] = useState<Set<string>>(() => new Set(usedHere.map((item) => item.id)));
  const toggle = (id: string) =>
    setEaten((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const body = (
    <>
      <p className="hint">
        {recipe.minutes} minutos. Usa {recipe.usa.join(', ') || 'o que tens'}.
        {recipe.falta.length > 0 && ` Falta: ${recipe.falta.join(', ')}.`}
      </p>
      <ol>
        {recipe.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
    </>
  );
  return (
    <article className="card recipe" aria-label={recipe.title}>
      <div className="recipe-head">
        <h3>{recipe.title}</h3>
        <button
          type="button"
          className="ghost recipe-star"
          aria-pressed={recipe.starred}
          onClick={() => void starRecipe(recipe.id, !recipe.starred)}
        >
          {recipe.starred ? '★ Guardada' : '☆ Guardar'}
        </button>
      </div>
      {open ? (
        body
      ) : (
        <details>
          <summary>Ver a receita</summary>
          {body}
        </details>
      )}
      {recipe.state === 'feita' && <p className="hint">✓ Já a fizeste.</p>}
      {finishing ? (
        <div className="recipe-finish" role="group" aria-label={`Fiz ${recipe.title}`}>
          <p>Gastaste o que ela usou? Marca o que acabou:</p>
          {usedHere.map((item) => (
            <label key={item.id} className="check">
              <input
                type="checkbox"
                checked={eaten.has(item.id)}
                onChange={() => toggle(item.id)}
              />
              <span>{item.name}</span>
            </label>
          ))}
          <div className="row wrap">
            <button
              type="button"
              className="primary"
              onClick={() => void madeRecipe(recipe.id, [...eaten])}
            >
              {eaten.size ? `Feito: ${eaten.size} comido${eaten.size === 1 ? '' : 's'}` : 'Feito'}
            </button>
            <button type="button" className="ghost" onClick={() => setFinishing(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="row wrap recipe-actions">
          {recipe.state === 'nova' && (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                usedHere.length ? setFinishing(true) : void madeRecipe(recipe.id, [])
              }
            >
              Fiz esta
            </button>
          )}
          <button type="button" className="ghost" onClick={() => void removeRecipe(recipe.id)}>
            Apagar
          </button>
        </div>
      )}
    </article>
  );
}

export function Recipes() {
  const items = useLiveQuery(() => activeItems(), []);
  const recipes = useLiveQuery(() => savedRecipes(), []);
  const [params] = useSearchParams();
  const only = params.get('alimento');
  const today = lisbonDate(new Date());
  const due = useMemo(
    () =>
      (items ?? [])
        .map((item) => light(item, today))
        .filter((lit) => !lit.longLife && (lit.light === 'red' || lit.light === 'amber'))
        .sort(bySoonest)
        .slice(0, MAX_ITEMS),
    [items, today],
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (items === undefined || recipes === undefined) return null;
  const active = new Map(items.map((item) => [item.id, item]));
  const shown = only ? recipes.filter((recipe) => recipe.item_ids.includes(only)) : recipes;
  const groups = groupRecipes(shown, new Set(active.keys()), new Date());
  const onlyItem = only ? active.get(only) : undefined;

  /** "Sugerir receitas" / "Outras ideias": only on a tap; what comes back is kept. */
  const ask = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const answer = await suggestRecipes(
        due.map((lit) => ({ name: lit.item.name, days: lit.daysLeft ?? 0 })),
      );
      await keepSuggestions(
        answer.recipes,
        due.map((lit) => ({ id: lit.item.id, name: lit.item.name })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível pensar em receitas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="recipes">
      <h1 className="page-title">O que cozinhar hoje?</h1>

      {only ? (
        <p className="hint">
          Receitas com {onlyItem?.name ?? 'este alimento'}. <Link to="/receitas">Ver todas</Link>.
        </p>
      ) : due.length === 0 ? (
        <p className="hint">
          Nada está a acabar a validade esta semana. Quando houver, aqui aparecem ideias para o
          aproveitar.
        </p>
      ) : (
        <>
          <p className="hint">
            Ideias com o que acaba primeiro: {due.map((lit) => lit.item.name).join(', ')}.
          </p>
          <AiCostNote operation="recipes" />
          <div className="form-actions">
            <button
              type="button"
              className={groups.current.length ? 'secondary' : 'primary'}
              disabled={busy}
              onClick={() => void ask()}
            >
              {groups.current.length
                ? 'Outras ideias'
                : error
                  ? 'Tentar outra vez'
                  : 'Sugerir receitas'}
            </button>
          </div>
        </>
      )}
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

      {groups.current.length > 0 && (
        <section aria-labelledby="recipes-current">
          <h2 className="section-title" id="recipes-current">
            Para o que tens agora
          </h2>
          {groups.current.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} active={active} />
          ))}
        </section>
      )}
      {groups.starred.length > 0 && (
        <section aria-labelledby="recipes-starred">
          <h2 className="section-title" id="recipes-starred">
            Guardadas
          </h2>
          {groups.starred.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} active={active} open={false} />
          ))}
        </section>
      )}
      {groups.past.length > 0 && (
        <section aria-labelledby="recipes-past">
          <h2 className="section-title" id="recipes-past">
            Anteriores
          </h2>
          <p className="hint">
            Dos últimos {PAST_DAYS} dias, para o que já não está em casa. Guarda (☆) as que quiseres
            manter.
          </p>
          {groups.past.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} active={active} open={false} />
          ))}
        </section>
      )}

      <p className="hint">
        As receitas são sugeridas pela IA escolhida nas definições e ficam guardadas neste telemóvel
        (com conta, para toda a casa). Confirma sempre o estado dos alimentos antes de cozinhar.
      </p>
    </div>
  );
}
