// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The end-to-end tests (pnpm test:e2e): the built app and its API in `wrangler dev`
 * (scripts/e2e-server.mjs, an empty local D1 each run), in Chromium, on a phone and on a
 * computer. Build first (`pnpm build`); the CI does it before.
 */
import { defineConfig, devices } from '@playwright/test';

// Not 8787 (another `wrangler dev` may hold it, and would be reused).
const PORT = 4320;

export default defineConfig({
  testDir: 'e2e',
  // One server, one database: the tests sign up distinct people, and run a few at a time.
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'telemóvel', use: { ...devices['Pixel 7'] } },
    {
      name: 'computador',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } },
    },
  ],
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    env: { E2E_PORT: String(PORT) },
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
