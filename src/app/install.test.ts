// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro and Faturómetro (src/app/install.test.ts).
import { describe, expect, it } from 'vitest';
import { manualBrowser } from './install';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0',
  samsung:
    'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
};

describe('install steps by browser', () => {
  it('tells the browsers apart', () => {
    expect(manualBrowser(UA.iphone, 5)).toBe('ios');
    // An iPad reports itself as a Mac with touch.
    expect(manualBrowser(UA.safariMac, 5)).toBe('ios');
    expect(manualBrowser(UA.safariMac, 0)).toBe('safari-mac');
    expect(manualBrowser(UA.chromeMac, 0)).toBe('chromium');
    expect(manualBrowser(UA.edge, 0)).toBe('chromium');
    expect(manualBrowser(UA.firefoxAndroid, 5)).toBe('firefox-android');
    expect(manualBrowser(UA.firefoxWindows, 0)).toBe('firefox-desktop');
    expect(manualBrowser(UA.samsung, 5)).toBe('samsung');
  });
});
