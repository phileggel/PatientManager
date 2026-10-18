import { browser } from "@wdio/globals";

/**
 * Invoke a Tauri command directly from the WebView, bypassing the UI.
 *
 * `__TAURI_INTERNALS__.invoke` resolves with the plain return value on success.
 * A command's error is caught in the page and returned as its JSON (a typed
 * `{ code, … }`) or its text. A failure of WebDriver itself still surfaces at
 * the Node.js level: we catch it there, strip the WebdriverIO wrapper, and
 * normalise both into one discriminated union.
 *
 * All calls go through the real Tauri IPC dispatcher to the real Rust binary —
 * no mocking at any layer.
 */
export async function tauriInvoke<T>(
  cmd: string,
  args: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  // DEBT-068 — a freshly started app may not have loaded the bridge yet (seen on
  // the Windows gate): wait for it before the first call.
  await browser.waitUntil(
    () =>
      browser.execute(
        // biome-ignore lint/suspicious/noExplicitAny: __TAURI_INTERNALS__ is untyped
        () => typeof (window as any).__TAURI_INTERNALS__?.invoke === "function",
      ),
    { timeout: 10000, timeoutMsg: "the Tauri bridge did not load within 10 s" },
  );
  try {
    // A typed error (`{ code, … }`) is caught in the page, where it is still an
    // object, and returned as its JSON: past the page, WebdriverIO turns it into
    // "[object Object]".
    const outcome = await browser.execute(
      async (command, invokeArgs) => {
        // biome-ignore lint/suspicious/noExplicitAny: __TAURI_INTERNALS__ is untyped
        const invoke = (window as any).__TAURI_INTERNALS__.invoke as (
          cmd: string,
          args: unknown,
        ) => Promise<unknown>;
        try {
          return { ok: true as const, data: await invoke(command, invokeArgs) };
        } catch (e) {
          const error =
            typeof e === "string"
              ? e
              : e instanceof Error
                ? e.message
                : (JSON.stringify(e) ?? String(e));
          return { ok: false as const, error };
        }
      },
      cmd,
      args,
    );
    return outcome.ok ? { ok: true, data: outcome.data as T } : outcome;
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
