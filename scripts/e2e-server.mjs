// SPDX-License-Identifier: AGPL-3.0-or-later
// The server for the end-to-end tests (playwright.config.ts): the built app and the API in
// `wrangler dev`, with an empty local D1 each run. Workers AI is left out (it only runs
// remotely and the tests never read photos), and the secrets are test values.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const PORT = process.env.E2E_PORT ?? '4320';
const CONFIG = 'wrangler.e2e.toml';
const STATE = '.wrangler/e2e';

// Without the [ai] block (up to the next blank line).
const config = readFileSync('wrangler.toml', 'utf8').replace(/\r\n/g, '\n');
writeFileSync(CONFIG, config.replace(/\n\[ai\]\n[\s\S]*?\n\n/, '\n'));
rmSync(STATE, { recursive: true, force: true });

const wrangler = (args, options) =>
  spawnSync('pnpm', ['exec', 'wrangler', ...args], { stdio: 'inherit', shell: true, ...options });

const migrated = wrangler([
  'd1',
  'migrations',
  'apply',
  'validometro',
  '--local',
  '-c',
  CONFIG,
  '--persist-to',
  STATE,
]);
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

const vars = {
  SESSION_SECRET: 'e2e-session-secret-at-least-32-characters',
  KEY_ENCRYPTION_SECRET: 'e2e-key-secret-at-least-32-characters!!!',
  ADMIN_EMAILS: 'admin@e2e.test',
};
const server = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
    'dev',
    '-c',
    CONFIG,
    '--port',
    PORT,
    '--persist-to',
    STATE,
    ...Object.entries(vars).flatMap(([key, value]) => ['--var', `${key}:${value}`]),
  ],
  { stdio: 'inherit', shell: true },
);
const stop = () => server.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
