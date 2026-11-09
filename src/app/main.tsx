// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Paulo Barbosa
import '@fontsource-variable/bricolage-grotesque';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { listenForInstall } from './install';
import { registerPwa } from './pwa';
import { router } from './router';
import './styles.css';

registerPwa();
// Before the browser fires beforeinstallprompt (install.ts).
listenForInstall();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
