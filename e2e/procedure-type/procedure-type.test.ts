import { browser, $ } from "@wdio/globals";
import assert from "node:assert";
import { setReactInputValue } from "../helpers/seed";

const PROCEDURE_TYPE_NAME = "E2E Smoke Acte";
const PROCEDURE_TYPE_AMOUNT = "42.50";

async function navigateToProcedureTypes(): Promise<void> {
  // Selectors target stable `id` attributes — locale-invariant per ADR-007.
  const mgmtBtn = await $("#nav-management");
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();

  const procedureTypeCard = await $("#mgmt-card-procedure-types");
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
    const fab = await $("#fab-create-procedure-type");
    await fab.waitForExist({ timeout: 5000 });
    await fab.click();

    // Fill the form inside the dialog
    await setReactInputValue("create-procedure-type-name", PROCEDURE_TYPE_NAME);
    await setReactInputValue("create-procedure-type-defaultAmount", PROCEDURE_TYPE_AMOUNT);

    const submitBtn = await $('button[type="submit"][form="create-procedure-type-form"]');
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();

    // Modal should close and new row appear in list
    const newRow = await $("#procedure-type-list").$(`td=${PROCEDURE_TYPE_NAME}`);
    await newRow.waitForExist({ timeout: 10000 });
    assert.ok(await newRow.isExisting(), "Newly created procedure type should be visible in list");
  });
});
