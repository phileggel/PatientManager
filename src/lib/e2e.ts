/**
 * E2E native-dialog override (ADR-007).
 *
 * Tauri WebDriver tests cannot drive native OS dialogs. Every gateway
 * method that wraps `@tauri-apps/plugin-dialog`'s `open()` or `save()`
 * routes through `e2eOverride()`, which lets a test substitute a
 * deterministic return value via `window.__e2e[<key>]` set from the
 * E2E side via `browser.execute`.
 *
 * The override branch is gated by `import.meta.env.MODE !== "production"`
 * so it tree-shakes out of `tauri build --release` (mode='production')
 * but stays present in:
 *   - `vite dev` / `tauri dev`           — MODE='development'
 *   - `vitest`                            — MODE='test'
 *   - `vite build --mode e2e` / E2E build — MODE='e2e'
 *
 * The E2E binary is produced via `npm run build:e2e` (= `vite build
 * --mode e2e`), wired through `src-tauri/tauri.e2e.conf.json` which
 * overrides Tauri's `beforeBuildCommand`. See ADR-007 for rationale.
 *
 * Net cost in production: zero (Vite constant-folds `MODE !==
 * "production"` to `false`; esbuild eliminates the branch).
 *
 * Adding a new native-API gateway:
 * 1. Add an entry to `Window["__e2e"]` below — key must match the
 *    gateway method name.
 * 2. **Mirror the same key in `e2e/helpers/e2e.ts::E2eOverrides`** —
 *    `e2e/` is outside the main `tsconfig.json::include`, so the test-
 *    side interface is a manual mirror. Skipping this step makes
 *    `setE2eOverrides({ newKey })` compile without firing the override.
 * 3. Wrap the gateway body in `e2eOverride("<key>", () => realImpl())`.
 * 4. Tests can now `setE2eOverrides({ <key>: <stub> })` before clicking
 *    the UI affordance that calls the gateway.
 */

declare global {
  interface Window {
    __e2e?: {
      /** Stub return value for `shell/gateway.ts::pickExcelFilePath`. */
      pickExcelFilePath?: string | null;
      /** Stub return value for `shell/gateway.ts::pickPdfFilePath`. */
      pickPdfFilePath?: string | null;
      /** Stub return value for `db-backup/gateway.ts::pickExportPath`. */
      pickExportPath?: string | null;
      /** Stub return value for `db-backup/gateway.ts::pickImportPath`. */
      pickImportPath?: string | null;
    };
  }
}

type E2eOverrides = NonNullable<Window["__e2e"]>;

/**
 * Strip `undefined` from an override value type. Every key in
 * `E2eOverrides` is optional, so `E2eOverrides[K]` always includes
 * `undefined` — but when the key is *present*, the value is the concrete
 * stub. The helper's return type reflects the "key present" case.
 */
type OverrideValue<K extends keyof E2eOverrides> = Exclude<E2eOverrides[K], undefined>;

/**
 * Returns the test override for `key` if set, otherwise calls `real()`.
 *
 * In production builds (`import.meta.env.MODE === "production"`), the
 * entire override branch tree-shakes out — `real()` is invoked
 * unconditionally.
 *
 * @param key - Lookup key in the typed `window.__e2e` namespace.
 * @param real - Production implementation, only called when no override
 *   is set.
 */
export async function e2eOverride<K extends keyof E2eOverrides>(
  key: K,
  real: () => Promise<OverrideValue<K>>,
): Promise<OverrideValue<K>> {
  // The `!== undefined` check is intentional vs. a bare `key in __e2e`: an
  // accidental `{ pickPdfFilePath: undefined }` from a future test helper
  // would pass `key in` but should NOT trigger the override (it has no
  // meaningful stub value). `null` is a legitimate stub (= "user cancel").
  //
  // The mode allowlist (vs. a denylist `!== "production"`) ensures any
  // future custom Vite mode — e.g. `staging`, `qa` — does NOT silently
  // inherit the override branch. New modes that need the override must
  // be added here explicitly.
  if (
    (import.meta.env.MODE === "development" ||
      import.meta.env.MODE === "test" ||
      import.meta.env.MODE === "e2e") &&
    window.__e2e &&
    window.__e2e[key] !== undefined
  ) {
    // Cast forced by the optional-key design: `__e2e[K]` is
    // `OverrideValue<K> | undefined`; the `!== undefined` guard above
    // narrows it to `OverrideValue<K>` semantically, but TS cannot prove
    // it through the indexed access. Safe by construction here.
    return window.__e2e[key] as OverrideValue<K>;
  }
  return real();
}
