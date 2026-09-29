import { $, browser } from "@wdio/globals";
import assert from "node:assert";
import { tauriInvoke } from "../helpers/tauri-invoke";

// Seeding goes through the real commands (no mock): a saved bank statement label
// only exists after a statement import is validated (BAS-035), and the import's
// PDF + native-dialog path is DEBT-009's scope. The deletion itself is driven
// through the UI.

const ACCOUNT_NAME = "E2E Label Account";
const FUND_IDENTIFIER = "e2e-label-fund";
const FUND_NAME = "E2E Label Fund";
const LABEL = "VIR E2E LABEL";
// Fixed past date (E9).
const STATEMENT_DATE = "2025-03-14";

async function seedLabel(): Promise<string> {
  const account = await tauriInvoke<{ id: string }>("create_bank_account", {
    name: ACCOUNT_NAME,
    iban: null,
  });
  assert.ok(
    account.ok,
    `create_bank_account failed: ${account.ok ? "" : account.error}`,
  );
  const fund = await tauriInvoke<{ id: string }>("add_fund", {
    fundIdentifier: FUND_IDENTIFIER,
    fundName: FUND_NAME,
  });
  assert.ok(fund.ok, `add_fund failed: ${fund.ok ? "" : fund.error}`);

  // BAS-035 — validating a LinkFund correction saves the label.
  const validated = await tauriInvoke<number>(
    "validate_bank_statement_reconciliation",
    {
      bankAccountId: account.data.id,
      parseResult: {
        iban: null,
        period: null,
        credit_lines: [{ date: STATEMENT_DATE, label: LABEL, amount: 12000 }],
        total_credits: 12000,
        unparsed_count: 0,
      },
      corrections: [
        {
          type: "LinkFund",
          bank_label: LABEL,
          assignment: { type: "Fund", fund_id: fund.data.id },
        },
      ],
    },
  );
  assert.ok(
    validated.ok,
    `validate failed: ${validated.ok ? "" : validated.error}`,
  );

  const labels = await tauriInvoke<{ id: string; bank_label: string }[]>(
    "list_bank_label_mappings",
    {},
  );
  assert.ok(
    labels.ok,
    `list_bank_label_mappings failed: ${labels.ok ? "" : labels.error}`,
  );
  const saved = labels.data.find((l) => l.bank_label === LABEL);
  assert.ok(saved, "the validated label should be saved");
  return saved.id;
}

async function openLabelsPage(): Promise<void> {
  // Close any dialog a previous suite left open (shared WebView session).
  await browser.keys(["Escape"]);
  const mgmtBtn = await $("#nav-management");
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();
  const card = await $("#mgmt-card-bank-statement-labels");
  await card.waitForExist({ timeout: 8000 });
  await card.click();
  await $("#bank-statement-label-list").waitForExist({ timeout: 10000 });
}

describe("bank statement labels", () => {
  let labelId: string;

  before(async () => {
    labelId = await seedLabel();
    await openLabelsPage();
  });

  it("BAS-043: a confirmed delete removes the label from the list", async () => {
    const row = await $(`#bank-statement-label-row-${labelId}`);
    await row.waitForExist({ timeout: 10000 });

    await (await $(`#bank-statement-label-delete-${labelId}`)).click();
    const confirm = await $(
      "#delete-bank-statement-label-confirmation-confirm",
    );
    await confirm.waitForClickable({ timeout: 5000 });
    await confirm.click();

    await row.waitForExist({ timeout: 10000, reverse: true });
    assert.ok(
      !(await row.isExisting()),
      "the deleted label should leave the list",
    );
  });
});
