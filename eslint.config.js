// SPDX-License-Identifier: AGPL-3.0-or-later
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'dev-dist', 'coverage', '.wrangler', 'src/worker/worker-configuration.d.ts'],
  },
  {
    files: ['**/*.{ts,js}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: ['*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
);
