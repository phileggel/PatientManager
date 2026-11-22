import assert from "node:assert";
import { $, browser } from "@wdio/globals";
import { clickWhenSettled, openManagementPage, waitUntilGone } from "../helpers/navigation";
import {
  readPatientIdByName,
  readProcedureTypeIdByName,
  seedPatient,
  seedProcedure,
  seedProcedureType,
  setReactInputValue,
  setReactSelectValue,
} from "../helpers/seed";
import { tauriInvoke } from "../helpers/tauri-invoke";

function isoToDisplayDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

// Fixed past date — avoids DuplicateDate collisions with other test runs (E9).
const PROCEDURE_DATE = "2020-06-15";
const PROCEDURE_DATE_DISPLAY = isoToDisplayDate(PROCEDURE_DATE);
const PATIENT_NAME = "E2E-BT-Patient";
const PROCEDURE_TYPE_NAME = "E2E-BT-Consultation";
const BILLED_AMOUNT_MILLIS = 25000; // €25.00

async function navigateToDirectPayments(): Promise<void> {
  // Selectors target stable `id` attributes — locale-invariant (E4).
  await browser.keys(["Escape"]);
  await openManagementPage("#mgmt-card-direct-payments", "#direct-payment-list");
}

// #642 — direct payments have their own page; a (+) opens the window that records one.
describe("direct payments — PATIENT_CASH smoke", () => {
  let procedureId = "";

  before(async () => {
    await seedPatient(PATIENT_NAME);
    const patientId = await readPatientIdByName(PATIENT_NAME);

    await seedProcedureType(PROCEDURE_TYPE_NAME, "25");
    const procedureTypeId = await readProcedureTypeIdByName(PROCEDURE_TYPE_NAME);

    procedureId = await seedProcedure(
      patientId,
      procedureTypeId,
      PROCEDURE_DATE,
      null,
      BILLED_AMOUNT_MILLIS,
    );
  });

  beforeEach(async () => {
    await navigateToDirectPayments();
  });

  it("the direct payments page renders with its list", async () => {
    const table = await $("#direct-payment-list");
    assert.ok(await table.isExisting(), "Direct payments page should render with a table");
  });

  it("records a cash payment from the (+) window and it appears in the list", async () => {
    // 1. Open the add window
    const fab = await $("#fab-create-direct-payment");
    await fab.waitForClickable({ timeout: 5000 });
    await fab.click();
    await $("#direct-payment-add-modal").waitForDisplayed({ timeout: 5000 });

    // 2. Pick cash, then the date — triggers the 7-day procedure fetch
    await setReactSelectValue("direct-payment-add-method", "PATIENT_CASH");
    await setReactInputValue("direct-payment-add-date", PROCEDURE_DATE_DISPLAY);

    // 3. Tick the seeded procedure, by its id: the list is redrawn while it loads, and
    // a row looked up by its text inside it went stale (E4).
    await clickWhenSettled(`#bank-transfer-procedure-candidate-check-${procedureId}`);

    // 4. The button turns on once something is ticked; it saves and closes the window
    const submitBtn = await $("#direct-payment-add-submit");
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();
    await waitUntilGone(() => $("#direct-payment-add-modal"), 10000, "the direct payment modal");

    // 5. The new row appears in the list
    const newRow = await $("#direct-payment-list").$(`td=${PROCEDURE_DATE_DISPLAY}`);
    await newRow.waitForExist({ timeout: 10000 });
    assert.ok(await newRow.isExisting(), "Payment row should appear in the list");
  });
});

// #642 — fund wires have their own page, listing their bank account.
describe("fund wires — page smoke", () => {
  it("the fund wires page renders with its list and its (+)", async () => {
    await browser.keys(["Escape"]);
    await openManagementPage("#mgmt-card-fund-wires", "#fund-wire-list");

    assert.ok(await $("#fund-wire-list").isExisting(), "Fund wires page should render a table");
    assert.ok(
      await $("#fab-create-fund-wire").isExisting(),
      "Fund wires page should offer the (+) that records a wire",
    );
  });
});

// #712 — a wire of a fund that sent no bordereau is recorded on its open procedures:
// their payment group is created on save (BSM-051).
describe("fund wires — a wire on a fund's open procedures (#712)", () => {
  const FUND_NAME = "E2E-BT-Fund-712";
  const ACCOUNT_NAME = "E2E-BT-Account-712";
  const PATIENT = "E2E-BT-Patient-712";
  const TYPE = "E2E-BT-Type-712";
  // An old procedure (E9): behind the display window until « show older » is clicked.
  const OLD_PROCEDURE_DATE = "2020-07-06";
  const WIRE_DATE_DISPLAY = isoToDisplayDate("2020-07-20");
  let accountId = "";
  let fundId = "";
  let procedureId = "";

  before(async () => {
    const account = await tauriInvoke<{ id: string }>("create_bank_account", {
      name: ACCOUNT_NAME,
      iban: null,
    });
    assert.ok(account.ok, `create_bank_account failed: ${account.ok ? "" : account.error}`);
    accountId = account.data.id;
    const fund = await tauriInvoke<{ id: string }>("add_fund", {
      fundIdentifier: "E2E712",
      fundName: FUND_NAME,
    });
    assert.ok(fund.ok, `add_fund failed: ${fund.ok ? "" : fund.error}`);
    fundId = fund.data.id;

    await seedPatient(PATIENT);
    const patientId = await readPatientIdByName(PATIENT);
    await seedProcedureType(TYPE, "46");
    const procedureTypeId = await readProcedureTypeIdByName(TYPE);
    procedureId = await seedProcedure(
      patientId,
      procedureTypeId,
      OLD_PROCEDURE_DATE,
      fundId,
      46000,
    );
  });

  it("records the wire from the (+) window and it appears in the list", async () => {
    await browser.keys(["Escape"]);
    await openManagementPage("#mgmt-card-fund-wires", "#fund-wire-list");
    const fab = await $("#fab-create-fund-wire");
    await fab.waitForClickable({ timeout: 5000 });
    await fab.click();
    await $("#fund-wire-add-modal").waitForDisplayed({ timeout: 5000 });

    // 1. The date and the account, then the procedures side and the fund
    await setReactInputValue("fund-wire-add-date", WIRE_DATE_DISPLAY);
    await setReactSelectValue("fund-wire-add-account", accountId);
    await $("#fund-wire-add-scope-procedures").click();
    await $("#fund-wire-add-fund").waitForExist({ timeout: 5000 });
    await setReactSelectValue("fund-wire-add-fund", fundId);

    // 2. The old procedure is behind the display window, as in « Rapprocher »
    const showOlder = await $("#fund-wire-add-open-procedures-show-older");
    await showOlder.waitForExist({ timeout: 8000 });
    await showOlder.click();
    await clickWhenSettled(`#fund-wire-add-open-procedures-check-proc-${procedureId}`);

    // 3. The button turns on once a procedure is ticked; it saves and closes the window
    const submitBtn = await $("#fund-wire-add-submit");
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();
    await waitUntilGone(() => $("#fund-wire-add-modal"), 10000, "the fund wire modal");

    // 4. The wire is listed, and its procedure is settled by the group it created
    const row = await $("#fund-wire-list").$(`td=${WIRE_DATE_DISPLAY}`);
    await row.waitForExist({ timeout: 10000 });
    const open = await tauriInvoke<unknown[]>("get_open_procedures_of_fund", { fundId });
    assert.ok(open.ok, `get_open_procedures_of_fund failed: ${open.ok ? "" : open.error}`);
    assert.strictEqual(open.data.length, 0, "the procedure is no longer open");
  });
});
