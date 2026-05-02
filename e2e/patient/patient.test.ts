import { browser, $ } from "@wdio/globals";
import assert from "node:assert";

async function setReactInputValue(elementId: string, value: string): Promise<void> {
  await browser.execute(
    (id, val) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeSetter?.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    elementId,
    value,
  );
}

const PATIENT_NAME = "E2E Smoke Patient";

async function navigateToPatients(): Promise<void> {
  // App runs in fr locale — aria-label values are French translations.
  const mgmtBtn = await $('button[aria-label="Gestion"]');
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();

  const patientCard = await $('button[aria-label="Patients"]');
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

    const submitBtn = await $('button[type="submit"]');
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();

    const newRow = await $(`//td[text()="${PATIENT_NAME}"]`);
    await newRow.waitForExist({ timeout: 10000 });
    assert.ok(await newRow.isExisting(), "Newly created patient should be visible in list");
  });
});
