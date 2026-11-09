// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro and Faturómetro (src/components/InstallButton.tsx).
import { useState } from 'react';
import { promptInstall, useInstallState } from '../install';
import { t } from '../i18n/pt-PT';

const copy = t.install;

/** Install button (Chrome/Edge) or the steps for this browser; nothing once installed. */
export function InstallButton({ className = 'primary' }: { className?: string }) {
  const state = useInstallState();
  const [showSteps, setShowSteps] = useState(false);

  if (state.kind === 'installed' || state.kind === 'installed-elsewhere') return null;

  if (state.kind === 'prompt') {
    return (
      <button type="button" className={className} onClick={() => void promptInstall()}>
        {copy.button}
      </button>
    );
  }

  const steps = copy.steps[state.browser];
  return (
    <div className="install-help">
      <button
        type="button"
        className={className}
        aria-expanded={showSteps}
        onClick={() => setShowSteps((open) => !open)}
      >
        {copy.button}
      </button>
      {showSteps && (
        <ol className="install-steps">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
