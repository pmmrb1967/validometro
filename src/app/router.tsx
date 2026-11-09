// SPDX-License-Identifier: AGPL-3.0-or-later
import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './AppShell';
import { AddItem } from './screens/AddItem';
import { Home } from './screens/Home';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'adicionar', element: <AddItem /> },
      { path: 'rever', element: <Review /> },
      { path: 'definicoes', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
