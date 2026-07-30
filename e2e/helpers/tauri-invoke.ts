import { browser } from "@wdio/globals";

/**
 * Invoke a Tauri command directly from the WebView, bypassing the UI.
 *
 * `__TAURI_INTERNALS__.invoke` resolves with the plain return value on success.
 * When a command returns `Err(String)`, Tauri's WebKit integration propagates
 * the error string as a WebDriver protocol script error — it bypasses the JS
 * promise chain and surfaces at the Node.js level as a `WebDriverError`. We
 * therefore catch at the Node.js level, strip the WebdriverIO wrapper, and
 * normalise into a discriminated union.
 *
 * All calls go through the real Tauri IPC dispatcher to the real Rust binary —
 * no mocking at any layer.
 */
export async function tauriInvoke<T>(
  cmd: string,
  args: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = await browser.execute(
      async (command, invokeArgs) => {
        // biome-ignore lint/suspicious/noExplicitAny: __TAURI_INTERNALS__ is untyped
        const invoke = (window as any).__TAURI_INTERNALS__.invoke as (
          cmd: string,
          args: unknown,
        ) => Promise<unknown>;
        return invoke(command, invokeArgs);
      },
      cmd,
      args,
    );
    return { ok: true, data: data as T };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // WebdriverIO prepends "WebDriverError: <msg>" or "<msg>: WebDriverError: <msg>"
    // when retrying. Strip the trailing " when running ..." annotation if present.
    const cleaned = raw
      .replace(/: WebDriverError:.*$/, "")
      .replace(/^WebDriverError: /, "")
      .replace(/ when running.*$/, "")
      .trim();
    return { ok: false, error: cleaned };
  }
}
