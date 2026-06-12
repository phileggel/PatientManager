/**
 * E2E — fund-reconciliation import entry point smoke
 *
 * Verifies the reconciliation import entry point is reachable and that the
 * fund-reconciliation card is present in the import modal.
 *
 * Limitation (known, per ADR-007 pattern):
 *   The full flow from card click → file dialog → ReconciliationModal →
 *   report step cannot be automated in WebDriver because step 2 (native OS
 *   file-picker dialog) is outside WebDriver's reach. The IPC contract is
 *   covered in generate.test.ts via direct invoke.
 *
 * What this test covers:
 *   - The Import nav button is present and opens the import modal.
 *   - The fund-reconciliation entry point is visible inside the modal,
 *     confirming FPR-010 wiring (Report button only visible at report step)
 *     is not broken at the page-navigation level.
 *
 * Selectors target stable `id` attributes — locale-invariant per ADR-007.
 */

import { $ } from "@wdio/globals";
import assert from "node:assert";

describe("ReconciliationPage entry point smoke", () => {
  it("import modal opens and shows the fund reconciliation entry point", async () => {
    const importBtn = await $("#nav-import");
    await importBtn.waitForExist({ timeout: 10000 });
    await importBtn.click();

    const dialog = await $("#import-modal");
    await dialog.waitForExist({ timeout: 8000 });

    const card = await $("#import-card-fund-reconciliation");
    await card.waitForExist({ timeout: 8000 });
    assert.ok(
      await card.isExisting(),
      "Fund reconciliation entry point must be visible in the import modal",
    );
  });
});
