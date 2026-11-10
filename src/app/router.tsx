// SPDX-License-Identifier: AGPL-3.0-or-later
import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './AppShell';
import { Account } from './screens/Account';
import { Admin } from './screens/Admin';
import { AddItem } from './screens/AddItem';
import { Home } from './screens/Home';
import { Landing } from './screens/Landing';
import { Privacy } from './screens/Privacy';
import { Recipes } from './screens/Recipes';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { Shopping } from './screens/Shopping';
import { Stats } from './screens/Stats';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'adicionar', element: <AddItem /> },
      { path: 'rever', element: <Review /> },
      { path: 'definicoes', element: <Settings /> },
      { path: 'conta', element: <Account /> },
      { path: 'entrar', element: <Account initialMode="entrar" /> },
      { path: 'criar-conta', element: <Account initialMode="criar" /> },
      { path: 'privacidade', element: <Privacy /> },
      { path: 'sobre', element: <Landing /> },
      { path: 'admin', element: <Admin /> },
      { path: 'compras', element: <Shopping /> },
      { path: 'jantar', element: <Recipes /> },
      { path: 'desperdicio', element: <Stats /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
