import assert from "node:assert";
import { $, browser } from "@wdio/globals";
import { openManagementPage } from "../helpers/navigation";
import {
  readPatientIdByName,
  readProcedureTypeIdByName,
  seedPatient,
  seedProcedure,
  seedProcedureType,
  setReactInputValue,
  setReactSelectValue,
} from "../helpers/seed";

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
  before(async () => {
    await seedPatient(PATIENT_NAME);
    const patientId = await readPatientIdByName(PATIENT_NAME);

    await seedProcedureType(PROCEDURE_TYPE_NAME, "25");
    const procedureTypeId = await readProcedureTypeIdByName(PROCEDURE_TYPE_NAME);

    await seedProcedure(patientId, procedureTypeId, PROCEDURE_DATE, null, BILLED_AMOUNT_MILLIS);
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

    // 3. Tick the seeded procedure
    const procedureLabel = await $("#bank-transfer-procedure-candidate-list").$(
      `label*=${PATIENT_NAME}`,
    );
    await procedureLabel.waitForExist({ timeout: 8000 });
    await procedureLabel.click();

    // 4. The button turns on once something is ticked; it saves and closes the window
    const submitBtn = await $("#direct-payment-add-submit");
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();
    await $("#direct-payment-add-modal").waitForExist({ timeout: 10000, reverse: true });

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
