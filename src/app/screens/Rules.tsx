// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "Regras de validade" (Definições): how long each kind of food lasts when there is no
 * printed date, by place, closed and opened. Each household can change the days; a printed
 * or typed date always wins (principle 5). With an account the change is the household's.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import {
  ruleKey,
  SHELF_LIFE_RULES,
  MAX_RULE_DAYS,
  type ShelfLifeRule,
} from '../../domain/shelf-life';
import { LOCATION_LABELS, LOCATIONS, type Location } from '../../domain/types';
import { useAccount } from '../account';
import { ApiError } from '../api';
import { saveRule, useOverrides } from '../rules';
import { countEstimatedUnder, reestimateItems } from '../store/items';
import { here } from '../device';

const STATE_LABEL = { fechado: 'Fechado', aberto: 'Aberto' } as const;

/** The rules of one place, one row per kind of food (closed and opened side by side). */
function byCategory(location: Location): ShelfLifeRule[][] {
  const groups = new Map<string, ShelfLifeRule[]>();
  for (const rule of SHELF_LIFE_RULES) {
    if (rule.location !== location) continue;
    groups.set(rule.category, [...(groups.get(rule.category) ?? []), rule]);
  }
  return [...groups.values()]
    .map((rules) => rules.sort((a) => (a.state === 'fechado' ? -1 : 1)))
    .sort((a, b) => a[0]!.label.localeCompare(b[0]!.label, 'pt'));
}

const daysWord = (days: number) => (days === 1 ? 'dia' : 'dias');

interface Offer {
  key: string;
  label: string;
  from: number;
  to: number;
  count: number;
}

function DaysField({
  rule,
  days,
  onSave,
}: {
  rule: ShelfLifeRule;
  days: number;
  onSave: (days: number | null) => Promise<void>;
}) {
  const [text, setText] = useState(String(days));
  const [shownFor, setShownFor] = useState(days);
  // Changed elsewhere (another phone, "Repor"): show the new value.
  if (shownFor !== days) {
    setShownFor(days);
    setText(String(days));
  }
  const commit = () => {
    const value = Number(text);
    if (!text.trim() || !Number.isInteger(value) || value < 0 || value > MAX_RULE_DAYS) {
      setText(String(days));
      return;
    }
    if (value !== days) void onSave(value === rule.days_default ? null : value);
  };
  return (
    <label className="rule-days">
      <span>{STATE_LABEL[rule.state]}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_RULE_DAYS}
        value={text}
        aria-label={`${rule.label}, ${STATE_LABEL[rule.state].toLowerCase()}, em dias`}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
        }}
      />
      <span className="rule-unit">{daysWord(Number(text) || 0)}</span>
    </label>
  );
}

export function Rules() {
  const account = useAccount();
  const signedIn = account.status === 'ready' && Boolean(account.me);
  const overrides = useOverrides();
  const [place, setPlace] = useState<Location>('frigorifico');
  const [error, setError] = useState<string>();
  const [offer, setOffer] = useState<Offer>();
  const [done, setDone] = useState<string>();
  const own = new Map(overrides.map((rule) => [ruleKey(rule), rule.days]));
  const daysOf = (rule: ShelfLifeRule) => own.get(ruleKey(rule)) ?? rule.days_default!;

  const save = async (rule: ShelfLifeRule, days: number | null) => {
    setError(undefined);
    setDone(undefined);
    const from = daysOf(rule);
    const to = days ?? rule.days_default!;
    try {
      await saveRule(rule, days);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível guardar. Tenta outra vez.',
      );
      return;
    }
    const key = ruleKey(rule);
    const count = await countEstimatedUnder(key);
    setOffer(count ? { key, label: rule.label, from, to, count } : undefined);
  };

  const adjust = async (current: Offer) => {
    const moved = await reestimateItems(current.key, current.from, current.to);
    setOffer(undefined);
    setDone(
      `${moved} ${moved === 1 ? 'alimento passou' : 'alimentos passaram'} a contar com ${current.to} ${daysWord(current.to)}.`,
    );
  };

  return (
    <div className="rules">
      <h1 className="page-title">Regras de validade</h1>
      <p className="hint">
        Quando não há data na embalagem, a app estima-a com estes dias, contados desde a compra (ou
        desde que abriste). Se em tua casa algo dura mais ou menos, muda o número. A data impressa
        ou escrita por ti conta sempre primeiro.
      </p>
      <p className="hint">
        {signedIn
          ? 'As mudanças são da casa: servem para todos os que a partilham.'
          : `Sem conta, as mudanças ficam só ${here()}.`}
      </p>

      <div className="filters" role="group" aria-label="Onde">
        {LOCATIONS.map((location) => (
          <button
            key={location}
            type="button"
            className="chip"
            aria-pressed={place === location}
            onClick={() => setPlace(location)}
          >
            {LOCATION_LABELS[location]}
          </button>
        ))}
      </div>

      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}
      {offer && (
        <div className="notice rules-offer" role="status">
          <p>
            {offer.count === 1 ? 'Há 1 alimento' : `Há ${offer.count} alimentos`} com a data
            estimada por “{offer.label}” ({offer.from} {daysWord(offer.from)}).
          </p>
          <div className="row wrap">
            <button type="button" className="secondary" onClick={() => void adjust(offer)}>
              Ajustar {offer.count === 1 ? 'a data' : 'as datas'} (
              {offer.to > offer.from ? '+' : '−'}
              {Math.abs(offer.to - offer.from)} {daysWord(Math.abs(offer.to - offer.from))})
            </button>
            <button type="button" className="ghost" onClick={() => setOffer(undefined)}>
              Deixar como estão
            </button>
          </div>
        </div>
      )}
      {done && (
        <p className="hint status-ok" role="status">
          ✓ {done}
        </p>
      )}

      <ul className="rule-list">
        {byCategory(place).map((rules) => {
          const first = rules[0]!;
          const longLife = rules.every((rule) => rule.days_default === null);
          const changed = rules.some((rule) => own.has(ruleKey(rule)));
          return (
            <li key={first.category} className={`rule${changed ? ' rule-changed' : ''}`}>
              <div className="rule-head">
                <span className="rule-name">{first.label}</span>
                {changed && (
                  <button
                    type="button"
                    className="ghost rule-reset"
                    onClick={() => {
                      for (const rule of rules) if (own.has(ruleKey(rule))) void save(rule, null);
                    }}
                  >
                    Repor
                  </button>
                )}
              </div>
              {longLife ? (
                <p className="rule-note">Longa duração: fica fora do semáforo.</p>
              ) : (
                <div className="rule-fields">
                  {rules.map((rule) => (
                    <DaysField
                      key={rule.state}
                      rule={rule}
                      days={daysOf(rule)}
                      onSave={(days) => save(rule, days)}
                    />
                  ))}
                </div>
              )}
              {changed && !longLife && (
                <p className="rule-note">
                  Habitual:{' '}
                  {rules
                    .map(
                      (rule) =>
                        `${STATE_LABEL[rule.state].toLowerCase()} ${rule.days_default} ${daysWord(rule.days_default!)}`,
                    )
                    .join(', ')}
                  .
                </p>
              )}
              {first.notes && !longLife && <p className="rule-note">{first.notes}.</p>}
            </li>
          );
        })}
      </ul>

      <Link className="button secondary" to="/definicoes">
        Voltar às definições
      </Link>
    </div>
  );
}
