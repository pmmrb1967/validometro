// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/** A password (or API key) field with an eye button, so what was typed can be checked. */
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  label: string;
  hint?: ReactNode;
  /** What the eye button shows and hides, for screen readers. */
  what?: string;
};

/** The eye to show; crossed out to hide again. */
function Eye({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      {crossed && (
        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function PasswordField({ label, hint, what = 'a palavra-passe', ...input }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input {...input} id={id} type={visible ? 'text' : 'password'} />
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? `Esconder ${what}` : `Mostrar ${what}`}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((shown) => !shown)}
        >
          <Eye crossed={visible} />
        </button>
      </div>
      {hint}
    </div>
  );
}
