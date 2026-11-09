// SPDX-License-Identifier: AGPL-3.0-or-later
// Worker tests run inside workerd with a local D1, migrated before each file (test/setup.ts).
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    new URL('./migrations', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  );
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
    },
  };
});
