import { browser, $ } from "@wdio/globals";
import assert from "node:assert";
import { setReactInputValue } from "../helpers/seed";

const PATIENT_NAME = "E2E Smoke Patient";

async function navigateToPatients(): Promise<void> {
  // Selectors target stable `id` attributes — locale-invariant per ADR-007.
  const mgmtBtn = await $("#nav-management");
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();

  const patientCard = await $("#mgmt-card-patients");
  await patientCard.waitForExist({ timeout: 8000 });
  await patientCard.click();

  const searchInput = await $("#patient-search");
  await searchInput.waitForExist({ timeout: 10000 });
}

describe("patient smoke", () => {
  beforeEach(async () => {
    await browser.keys(["Escape"]);
    await navigateToPatients();
  });

  it("patient page renders with search input", async () => {
    const searchInput = await $("#patient-search");
    assert.ok(await searchInput.isExisting(), "PatientsManager should render with search input");
  });

  it("create_patient: new patient appears in list after submit", async () => {
    await setReactInputValue("add-patient-name", PATIENT_NAME);

    const submitBtn = await $('button[type="submit"][form="add-patient-form"]');
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();

    const newRow = await $("#patient-list").$(`td=${PATIENT_NAME}`);
    await newRow.waitForExist({ timeout: 10000 });
    assert.ok(await newRow.isExisting(), "Newly created patient should be visible in list");
  });
});
