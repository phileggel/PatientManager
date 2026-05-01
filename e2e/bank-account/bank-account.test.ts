import { browser, $ } from "@wdio/globals";
import assert from "node:assert";

// Skipped commands (no UI surface):
//   read_bank_account        — internal / no dedicated UI entry point
//   get_cash_bank_account_id — internal / auto-called by bank-transfer form

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

const SEED_NAME = "E2E Smoke Seed";
const CREATE_NAME = "E2E Smoke Create";
const UPDATE_NAME = "E2E Smoke Updated";

async function navigateToBankAccounts(): Promise<void> {
  // App runs in fr locale — aria-label values are French translations.
  const mgmtBtn = await $('button[aria-label="Gestion"]');
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();

  const bankAccountCard = await $('button[aria-label="Comptes Bancaires"]');
  await bankAccountCard.waitForExist({ timeout: 8000 });
  await bankAccountCard.click();

  const searchInput = await $("#bank-account-search");
  await searchInput.waitForExist({ timeout: 10000 });
}

describe("bank-account smoke", () => {
  before(async () => {
    // Seed one account so the update test has something to edit.
    await navigateToBankAccounts();
    await setReactInputValue("add-bank-account-name", SEED_NAME);
    const createBtn = await $('button[type="submit"][form="add-bank-account-form"]');
    await createBtn.waitForEnabled({ timeout: 5000 });
    await createBtn.click();
    const seededRow = await $(`//td[text()="${SEED_NAME}"]`);
    await seededRow.waitForExist({ timeout: 10000 });
  });

  beforeEach(async () => {
    await browser.keys(["Escape"]);
    await navigateToBankAccounts();
  });

  it("read_all_bank_accounts: bank account page renders", async () => {
    const searchInput = await $("#bank-account-search");
    assert.ok(
      await searchInput.isExisting(),
      "BankAccountManager should render with search input",
    );
  });

  it("create_bank_account: new account appears in list after submit", async () => {
    await setReactInputValue("add-bank-account-name", CREATE_NAME);
    const createBtn = await $('button[type="submit"][form="add-bank-account-form"]');
    await createBtn.waitForEnabled({ timeout: 5000 });
    await createBtn.click();

    const newRow = await $(`//td[text()="${CREATE_NAME}"]`);
    await newRow.waitForExist({ timeout: 10000 });
    assert.ok(await newRow.isExisting(), "Newly created account should be visible in list");
  });

  it("create_bank_account: shows validation error on empty name (NameEmpty)", async () => {
    // Submit without filling the name field — hook validates and sets errors.name.
    const createBtn = await $('button[type="submit"][form="add-bank-account-form"]');
    await createBtn.waitForExist({ timeout: 5000 });
    await createBtn.click();

    // TextField now renders errors with role="alert" (E5 fix).
    const errorEl = await $('form#add-bank-account-form [role="alert"]');
    await errorEl.waitForDisplayed({ timeout: 5000 });
    const errorText = await errorEl.getText();
    assert.ok(errorText.trim().length > 0, "Validation error message must be non-empty");
  });

  it("update_bank_account: edited name appears in list after submit", async () => {
    const editBtn = await $(`button[aria-label="Modifier le compte ${SEED_NAME}"]`);
    await editBtn.waitForExist({ timeout: 8000 });
    await editBtn.click();

    const form = await $("form#edit-bank-account-form");
    await form.waitForExist({ timeout: 8000 });

    await setReactInputValue("edit-bank-account-name", UPDATE_NAME);

    const submitBtn = await $('button[type="submit"][form="edit-bank-account-form"]');
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();

    await form.waitForExist({ timeout: 8000, reverse: true });
    assert.strictEqual(await form.isExisting(), false, "Edit modal should close after update");

    const updatedRow = await $(`//td[text()="${UPDATE_NAME}"]`);
    await updatedRow.waitForExist({ timeout: 10000 });
    assert.ok(await updatedRow.isExisting(), "Updated name should be visible in list");
  });
});
