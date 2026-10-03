/**
 * E2E — bank statement reconciliation, the real flow end to end.
 *
 * Import card → statement PDF → label step → settlement → validate → a bank
 * transfer exists. The native file dialog is bypassed with ADR-007's
 * `pickPdfFilePath` override; everything after it is the real app: the PDF is
 * read and parsed by the backend, the labels are decided in the UI, and the
 * validation writes through the real commands.
 *
 * The PDF is the committed synthetic fixture of the codec round-trip tests
 * (three credit lines, a made-up IBAN). It is copied under the home directory
 * first: the backend only opens a statement from there.
 */

import { $, browser } from "@wdio/globals";
import assert from "node:assert";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearE2eOverrides, setE2eOverrides } from "../helpers/e2e";
import { setReactSelectValue } from "../helpers/seed";
import { tauriInvoke } from "../helpers/tauri-invoke";

const FIXTURE = fileURLToPath(
  new URL(
    "../../src-tauri/tests/fixtures/bank_pdf/happy_path_multi_label.pdf",
    import.meta.url,
  ),
);
// The fixture's header IBAN and its three credit lines (see its .expected.json).
const FIXTURE_IBAN = "FR7600000000000000000000000";
const MATCHED_LABEL = "CPAM01";
const MATCHED_AMOUNT = 100000;
const IGNORED_LABELS = ["MUTUELLEGENERALEEDUCATIONNAT", "CPAMHAUTSDESEINE"];
// Fixed past dates (E9): the group is paid two days before the statement line
// of 2025-05-02, inside the auto-match window.
const PROCEDURE_DATE = "2025-04-28";
const GROUP_PAYMENT_DATE = "2025-04-30";

async function invokeOk<T>(cmd: string, args: unknown): Promise<T> {
  const result = await tauriInvoke<T>(cmd, args);
  assert.ok(result.ok, `${cmd} failed: ${result.ok ? "" : result.error}`);
  return result.data;
}

describe("Bank statement reconciliation — full flow from a statement PDF", () => {
  let workDir: string;
  let fundId: string;
  let transfersBefore: number;

  before(async () => {
    workDir = mkdtempSync(join(os.homedir(), ".patient-manager-e2e-"));
    const statementPath = join(workDir, "statement.pdf");
    copyFileSync(FIXTURE, statementPath);

    await $("#nav-import").waitForExist({ timeout: 10000 });

    // The account the statement's IBAN resolves to, and a fund payment group
    // the first credit line can settle.
    await invokeOk("create_bank_account", {
      name: "E2E Statement Account",
      iban: FIXTURE_IBAN,
    });
    const fund = await invokeOk<{ id: string }>("add_fund", {
      fundIdentifier: "e2e-statement-fund",
      fundName: "E2E Statement Fund",
    });
    fundId = fund.id;
    const patient = await invokeOk<{ id: string }>("add_patient", {
      name: "E2E Statement Patient",
      ssn: null,
    });
    const procedureType = await invokeOk<{ id: string }>("add_procedure_type", {
      name: "E2E Statement Type",
      defaultAmount: MATCHED_AMOUNT,
      category: null,
    });
    const procedure = await invokeOk<{ id: string }>("add_procedure", {
      patientId: patient.id,
      fundId,
      procedureTypeId: procedureType.id,
      procedureDate: PROCEDURE_DATE,
      billedAmount: MATCHED_AMOUNT,
    });
    await invokeOk("create_fund_payment_group", {
      fundId,
      paymentDate: GROUP_PAYMENT_DATE,
      procedureIds: [procedure.id],
    });
    transfersBefore = (await invokeOk<unknown[]>("read_all_bank_transfers", {})).length;

    await setE2eOverrides({ pickPdfFilePath: statementPath });
  });

  after(async () => {
    await clearE2eOverrides();
    // maxInstances: 1 — never leak an open modal into the next spec.
    await browser.keys("Escape");
    rmSync(workDir, { recursive: true, force: true });
  });

  // One scenario, not one `it` per step: the reconciliation draft lives in the
  // open dialog until it is validated, so a later step cannot be reached on its
  // own.
  it("imports the statement, decides its labels and validates into a bank transfer", async () => {
    // Open the statement: every label is listed.
    await browser.keys("Escape");
    await $("#nav-import").click();
    const card = await $("#import-card-bank-reconciliation");
    await card.waitForExist({ timeout: 8000 });
    await card.click();

    await $("#bank-statement-modal").waitForExist({ timeout: 15000 });
    await $("#label-assoc-title").waitForExist({ timeout: 15000 });
    for (const label of [MATCHED_LABEL, ...IGNORED_LABELS]) {
      assert.ok(
        await $(`#label-assoc-row-${label}`).isExisting(),
        `the statement's label ${label} must be listed`,
      );
    }

    // Link one label to its fund, ignore the two others, continue.
    await setReactSelectValue(`label-assoc-select-${MATCHED_LABEL}`, fundId);
    await browser.waitUntil(
      async () => (await $(`#label-assoc-select-${MATCHED_LABEL}`).getValue()) === fundId,
      { timeout: 10000, timeoutMsg: "the label should show its linked fund" },
    );

    for (const label of IGNORED_LABELS) {
      const ignore = await $(`#label-assoc-ignore-${label}`);
      await ignore.waitForEnabled({ timeout: 10000 });
      await ignore.click();
    }

    const next = await $("#label-assoc-continue");
    await next.waitForEnabled({ timeout: 10000 });
    await next.click();
    await $("#reconciliation-list").waitForExist({ timeout: 10000 });

    // Validate the settlement: a bank transfer exists.
    const validate = await $("#reconciliation-validate");
    // Enabled once every line is decided: the linked label's line matched the
    // seeded group on its own, the two others are ignored.
    await validate.waitForEnabled({ timeout: 10000 });
    await validate.click();

    // The settlement screen gives way to the done summary once the validation
    // went through.
    await $("#reconciliation-validate").waitForExist({ reverse: true, timeout: 15000 });

    await browser.waitUntil(
      async () =>
        (await invokeOk<unknown[]>("read_all_bank_transfers", {})).length === transfersBefore + 1,
      { timeout: 15000, timeoutMsg: "validation should create exactly one bank transfer" },
    );

    const labels = await invokeOk<{ bank_label: string; fund_id: string | null }[]>(
      "list_bank_label_mappings",
      {},
    );
    assert.strictEqual(
      labels.find((l) => l.bank_label === MATCHED_LABEL)?.fund_id,
      fundId,
      "the linked label is saved with its fund",
    );
    for (const label of IGNORED_LABELS) {
      const saved = labels.find((l) => l.bank_label === label);
      assert.ok(saved, `the ignored label ${label} is saved`);
      assert.strictEqual(saved.fund_id, null, `${label} is saved as ignored`);
    }
  });
});
