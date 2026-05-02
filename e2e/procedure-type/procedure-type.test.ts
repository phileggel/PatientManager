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

const PROCEDURE_TYPE_NAME = "E2E Smoke Acte";
const PROCEDURE_TYPE_AMOUNT = "42.50";

async function navigateToProcedureTypes(): Promise<void> {
  // App runs in fr locale — aria-label values are French translations.
  const mgmtBtn = await $('button[aria-label="Gestion"]');
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();

  const procedureTypeCard = await $('button[aria-label="Types d\'actes"]');
  await procedureTypeCard.waitForExist({ timeout: 8000 });
  await procedureTypeCard.click();

  const searchInput = await $("#procedure-type-search");
  await searchInput.waitForExist({ timeout: 10000 });
}

describe("procedure-type smoke", () => {
  beforeEach(async () => {
    await browser.keys(["Escape"]);
    await navigateToProcedureTypes();
  });

  it("procedure-type page renders with search input", async () => {
    const searchInput = await $("#procedure-type-search");
    assert.ok(
      await searchInput.isExisting(),
      "ProcedureTypeManager should render with search input",
    );
  });

  it("create_procedure_type: new type appears in list after submit", async () => {
    // Open create modal via FAB
    const fab = await $('button[aria-label="Créer un type d\'acte"]');
    await fab.waitForExist({ timeout: 5000 });
    await fab.click();

    // Fill the form inside the dialog
    await setReactInputValue("create-procedure-type-name", PROCEDURE_TYPE_NAME);
    await setReactInputValue("create-procedure-type-defaultAmount", PROCEDURE_TYPE_AMOUNT);

    const submitBtn = await $('button[type="submit"][form="create-procedure-type-form"]');
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();

    // Modal should close and new row appear in list
    const newRow = await $(`//td[text()="${PROCEDURE_TYPE_NAME}"]`);
    await newRow.waitForExist({ timeout: 10000 });
    assert.ok(await newRow.isExisting(), "Newly created procedure type should be visible in list");
  });
});
