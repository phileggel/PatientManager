/**
 * E2E native-dialog override helpers (ADR-007).
 *
 * Tauri WebDriver cannot drive native OS dialogs. Tests substitute
 * deterministic return values via `window.__e2e[<key>]`, which the
 * production gateway functions consult through `e2eOverride()` (see
 * `src/lib/e2e.ts`).
 *
 * Usage:
 * ```ts
 * import { setE2eOverrides, clearE2eOverrides } from "../helpers/e2e";
 *
 * before(async () => {
 *   await setE2eOverrides({
 *     pickPdfFilePath: "/path/to/fixture.pdf",
 *   });
 * });
 *
 * after(async () => {
 *   await clearE2eOverrides();
 * });
 * ```
 *
 * Keys must match the gateway method name. See the `Window["__e2e"]`
 * declaration in `src/lib/e2e.ts` for the authoritative list.
 */
import { browser } from "@wdio/globals";

/**
 * Subset of `Window["__e2e"]` exposed to tests. Mirrors the production
 * declaration in `src/lib/e2e.ts`. Kept inline (not imported) so the
 * E2E test bundle stays decoupled from the app's internal types.
 */
export interface E2eOverrides {
  pickExcelFilePath?: string | null;
  pickPdfFilePath?: string | null;
  pickExportPath?: string | null;
  pickImportPath?: string | null;
}

/**
 * Set `window.__e2e` in the running app.
 *
 * Each subsequent gateway call whose key matches an entry returns the
 * stub value without invoking the OS dialog.
 */
export async function setE2eOverrides(overrides: E2eOverrides): Promise<void> {
  await browser.execute((o) => {
    window.__e2e = o as Window["__e2e"];
  }, overrides);
}

/**
 * Remove all overrides. Subsequent gateway calls fall through to the
 * real `@tauri-apps/plugin-dialog` invocations.
 */
export async function clearE2eOverrides(): Promise<void> {
  await browser.execute(() => {
    delete (window as Window).__e2e;
  });
}
