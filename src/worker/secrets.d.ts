// SPDX-License-Identifier: AGPL-3.0-or-later
// Worker secrets (`wrangler secret put …`), not in wrangler.toml so `wrangler types` misses them.
interface __BaseEnv_Env {
  /** Signs the session cookies: at least 32 random characters. */
  SESSION_SECRET?: string;
  /** Seals the users' AI keys in D1 (AES-GCM): at least 32 random characters. */
  KEY_ENCRYPTION_SECRET?: string;
  /** Web Push: uncompressed P-256 public key and private scalar (base64url). */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Administrators' emails, comma-separated. */
  ADMIN_EMAILS?: string;
}
