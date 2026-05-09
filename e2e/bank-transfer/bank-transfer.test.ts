import { browser, $ } from "@wdio/globals";
import assert from "node:assert";
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

async function navigateToBankTransfer(): Promise<void> {
  // Selectors target stable `id` attributes — locale-invariant per ADR-007.
  await browser.keys(["Escape"]);
  const mgmtBtn = await $("#nav-management");
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();
  const btCard = await $("#mgmt-card-bank-transfers");
  await btCard.waitForExist({ timeout: 8000 });
  await btCard.click();
  await $(".m3-table-container").waitForExist({ timeout: 10000 });
}

describe("bank-transfer — PATIENT_CASH smoke", () => {
  before(async () => {
    await seedPatient(PATIENT_NAME);
    const patientId = await readPatientIdByName(PATIENT_NAME);

    await seedProcedureType(PROCEDURE_TYPE_NAME, "25");
    const procedureTypeId = await readProcedureTypeIdByName(PROCEDURE_TYPE_NAME);

    await seedProcedure(patientId, procedureTypeId, PROCEDURE_DATE, null, BILLED_AMOUNT_MILLIS);
  });

  beforeEach(async () => {
    await navigateToBankTransfer();
  });

  it("bank-transfer page renders with the transfers table", async () => {
    const table = await $(".m3-table-container");
    assert.ok(await table.isExisting(), "Bank transfer page should render with a table");
  });

  it("creates a PATIENT_CASH transfer and it appears in the list", async () => {
    // 1. Switch to PATIENT_CASH — SelectProceduresPanel renders, bank account hidden
    await setReactSelectValue("type", "PATIENT_CASH");

    // 2. Set transfer date — triggers getEligibleProceduresForDirectPayment(date) fetch
    await setReactInputValue("transferDate", PROCEDURE_DATE_DISPLAY);

    // 3. Wait for the seeded procedure to appear and select it
    const procedureLabel = await $(`//label[contains(., "${PATIENT_NAME}")]`);
    await procedureLabel.waitForExist({ timeout: 8000 });
    await procedureLabel.click();

    // 4. Submit — button enabled once date + selection are set
    const submitBtn = await $('button[type="submit"][form="add-bank-transfer-form"]');
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();

    // 5. Assert the new row appears in the transfers list
    const newRow = await $(`//td[text()="${PROCEDURE_DATE_DISPLAY}"]`);
    await newRow.waitForExist({ timeout: 10000 });
    assert.ok(await newRow.isExisting(), "Transfer row should appear in the list");
  });
});
