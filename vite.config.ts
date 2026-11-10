// SPDX-License-Identifier: AGPL-3.0-or-later
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** Short commit of the build, shown in the footer so it is clear which version is running. */
function buildCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(buildCommit()),
  },
  plugins: [
    react(),
    VitePWA({
      // A new version is offered, never applied mid-task (src/app/pwa.ts).
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Validómetro',
        short_name: 'Validómetro',
        description: 'Controla as validades dos alimentos lá de casa e desperdiça menos.',
        lang: 'pt-PT',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f6f8',
        theme_color: '#163a5f',
        // Lets Chrome/Edge tell the app it is installed (install.ts, getInstalledRelatedApps).
        related_applications: [{ platform: 'webapp', url: '/manifest.webmanifest' }],
        // "Partilhar" from another app (a digital receipt, a screenshot): public/push-sw.js.
        share_target: {
          action: '/partilhar',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'talao', accept: ['image/*'] }] },
        },
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The API shares the origin: never answer it with the app shell.
        navigateFallbackDenylist: [/^\/api(\/|$)/],
        // The daily alert and its one-tap answers (public/push-sw.js).
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  // `pnpm dev` (Vite) sends /api to `wrangler dev` on its default port.
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
});
