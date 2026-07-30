/**
 * E2E — bank-statement reconciliation entry point + IPC smoke
 *
 * Limitation (known, per ADR-007 pattern):
 *   The full flow (card click → native OS file dialog → BankStatementModal →
 *   correction flow → validate) cannot be automated in WebDriver because the
 *   file picker is outside WebDriver's reach — same category as the
 *   fund-payment-report suite. The correction/validate logic is densely
 *   covered by unit + RTL integration tests.
 *
 * What this suite covers:
 *   - The Import nav button opens the import modal and the bank-reconciliation
 *     entry card is present (page-navigation wiring).
 *   - `compute_bank_statement_reconciliation` answers over the real Tauri IPC
 *     dispatcher against the real binary: a synthetic statement with an
 *     unknown label recomputes to a NeedsLink line (BAS-060/061) — no mocking
 *     at any layer.
 *
 * Selectors target stable `id` attributes — locale-invariant per ADR-007.
 */

import { $, browser } from "@wdio/globals";
import assert from "node:assert";

/** Invoke a Tauri command directly from the WebView, bypassing the UI. */
async function tauriInvoke<T>(
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
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface ReconciliationSmoke {
  lines: { status: string }[];
  needs_correction_count: number;
}

describe("Bank statement reconciliation entry point smoke", () => {
  it("import modal opens and shows the bank reconciliation entry point", async () => {
    const importBtn = await $("#nav-import");
    await importBtn.waitForExist({ timeout: 10000 });
    await importBtn.click();

    const dialog = await $("#import-modal");
    await dialog.waitForExist({ timeout: 8000 });

    const card = await $("#import-card-bank-reconciliation");
    await card.waitForExist({ timeout: 8000 });
    assert.ok(
      await card.isExisting(),
      "Bank reconciliation entry point must be visible in the import modal",
    );
  });

  it("compute_bank_statement_reconciliation recomputes a NeedsLink draft over real IPC", async () => {
    const result = await tauriInvoke<ReconciliationSmoke>(
      "compute_bank_statement_reconciliation",
      {
        bankAccountId: "e2e-smoke-account",
        parseResult: {
          iban: null,
          period: null,
          credit_lines: [
            { date: "2026-01-15", label: "E2EUNKNOWNLABEL", amount: 100000 },
          ],
          total_credits: 100000,
          unparsed_count: 0,
        },
        corrections: [],
      },
    );

    assert.ok(result.ok, `compute must succeed, got: ${result.ok ? "" : result.error}`);
    assert.strictEqual(result.data.lines.length, 1);
    assert.strictEqual(
      result.data.lines[0]?.status,
      "NeedsLink",
      "an unknown label recomputes to NeedsLink (BAS-061)",
    );
    assert.strictEqual(result.data.needs_correction_count, 1);
  });
});
