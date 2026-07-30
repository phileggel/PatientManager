/**
 * E2E — bank-statement reconciliation entry point + IPC smoke
 *
 * Scope (deliberate, KISS): entry-point wiring + one real-IPC recompute. The
 * deeper flow (card click → file pick → BankStatementModal → correction →
 * validate) IS drivable — ADR-007's `setE2eOverrides({ pickPdfFilePath })`
 * exists precisely to bypass the native file dialog — but needs a committed
 * fixture bank-statement PDF and its own scenario budget; tracked in
 * docs/techdebt.md (2026-07-30, "Deep bank-statement E2E via ADR-007").
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
import { tauriInvoke } from "../helpers/tauri-invoke";

interface ReconciliationSmoke {
  lines: { status: string }[];
  needs_correction_count: number;
}

describe("Bank statement reconciliation entry point smoke", () => {
  // maxInstances: 1 — the session is shared across spec files; never leak an
  // open modal into whichever spec runs next.
  after(async () => {
    await browser.keys("Escape");
  });

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
