// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/** The icon's own background, so the padding of maskable and Apple icons blends in. */
const BRAND_BACKGROUND = '#1f4d3a';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: BRAND_BACKGROUND },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: BRAND_BACKGROUND },
    },
  },
  images: ['public/icon.svg'],
});
