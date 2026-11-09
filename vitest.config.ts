// SPDX-License-Identifier: AGPL-3.0-or-later
// Two projects: "worker" runs inside workerd with a local D1, migrated before each file
// (test/setup.ts); "app" runs the domain and browser-side code in Node (IndexedDB faked).
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    fileURLToPath(new URL('./migrations', import.meta.url)),
  );
  return {
    test: {
      projects: [
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: './wrangler.toml' },
              // Tests pass a fake Workers AI binding; never reach Cloudflare (CI has no login).
              remoteBindings: false,
              miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
            }),
          ],
          test: {
            name: 'worker',
            include: ['test/**/*.test.ts'],
            setupFiles: ['./test/setup.ts'],
          },
        },
        {
          define: { __APP_VERSION__: '"0.0.0"', __APP_COMMIT__: '"test"' },
          test: {
            name: 'app',
            environment: 'node',
            include: ['src/**/*.test.ts'],
          },
        },
      ],
    },
  };
});
