// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * "A ler o talão…": while the AI reads (up to half a minute on the free reader), a note that
 * is seen, with a spinner (still when the system asks for less motion), instead of grey text.
 * A progress message ends in "…"; anything else (a result, an error) is a plain note.
 */
import type { ReactNode } from 'react';

export function BusyNote({ children, detail }: { children: ReactNode; detail?: ReactNode }) {
  return (
    <p className="note busy" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>
        <strong>{children}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </p>
  );
}

/** A status line: busy when it says something is under way ("A ler a data…"). */
export function StatusNote({ text }: { text: string | undefined }) {
  if (!text) return null;
  if (text.trimEnd().endsWith('…')) return <BusyNote>{text}</BusyNote>;
  return (
    <p className="note" role="status">
      {text}
    </p>
  );
}
