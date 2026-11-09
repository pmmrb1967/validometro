// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
/**
 * A button that opens the camera (or the gallery) and hands back the photo already made
 * small. The photo is never kept: only the base64 of the small copy, for one request.
 */
import { useRef, type ReactNode } from 'react';
import { shrinkPhoto } from '../image';

interface Props {
  className?: string;
  disabled?: boolean;
  children: ReactNode;
  onPhoto: (base64: string) => void;
  onError: (message: string) => void;
}

export function PhotoButton({
  className = 'secondary',
  disabled,
  children,
  onPhoto,
  onError,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const small = await shrinkPhoto(file);
          if (small) onPhoto(small);
          else onError('Não consegui abrir essa foto. Tenta outra.');
        }}
      />
    </>
  );
}
