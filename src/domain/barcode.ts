// SPDX-License-Identifier: AGPL-3.0-or-later

/** A valid EAN-8, UPC-A (12), EAN-13 or GTIN-14, check digit included. */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  // From the right, excluding the check digit: weights 3, 1, 3, 1…
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
