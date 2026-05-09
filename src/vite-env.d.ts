/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Initial i18n locale, set per-build-mode via `.env.<mode>` files.
   * - `.env.test`  → "en" (vitest invariant)
   * - `.env.e2e`   → "en" (WebDriver E2E invariant)
   * - prod / dev   → undefined → falls back to "fr"
   * See `src/i18n/config.ts` and ADR-007.
   */
  readonly VITE_LOCALE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
