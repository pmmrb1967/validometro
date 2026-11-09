// SPDX-License-Identifier: AGPL-3.0-or-later
import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './AppShell';
import { Home } from './screens/Home';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
