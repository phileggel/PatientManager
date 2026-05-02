/**
 * Seed helpers for E2E tests.
 *
 * Each function creates one entity via the UI and waits for confirmation that it
 * persisted. Tests that need prerequisites call these in their `before()` hook.
 *
 * All navigation uses French aria-labels (app locale is fr).
 */
import { browser, $ } from "@wdio/globals";

export async function setReactInputValue(elementId: string, value: string): Promise<void> {
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

async function openManagementModal(): Promise<void> {
  await browser.keys(["Escape"]);
  const mgmtBtn = await $('button[aria-label="Gestion"]');
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();
}

export async function seedBankAccount(name: string): Promise<void> {
  await openManagementModal();
  const card = await $('button[aria-label="Comptes Bancaires"]');
  await card.waitForExist({ timeout: 8000 });
  await card.click();
  await $("#bank-account-search").waitForExist({ timeout: 10000 });

  await setReactInputValue("add-bank-account-name", name);
  const submitBtn = await $('button[type="submit"][form="add-bank-account-form"]');
  await submitBtn.waitForEnabled({ timeout: 5000 });
  await submitBtn.click();
  await $(`//td[text()="${name}"]`).waitForExist({ timeout: 10000 });
}

export async function seedProcedureType(name: string, amount: string): Promise<void> {
  await openManagementModal();
  const card = await $('button[aria-label="Types d\'actes"]');
  await card.waitForExist({ timeout: 8000 });
  await card.click();
  await $("#procedure-type-search").waitForExist({ timeout: 10000 });

  const fab = await $('button[aria-label="Créer un type d\'acte"]');
  await fab.waitForExist({ timeout: 5000 });
  await fab.click();

  await setReactInputValue("create-procedure-type-name", name);
  await setReactInputValue("create-procedure-type-defaultAmount", amount);

  const submitBtn = await $('button[type="submit"][form="create-procedure-type-form"]');
  await submitBtn.waitForEnabled({ timeout: 5000 });
  await submitBtn.click();
  await $(`//td[text()="${name}"]`).waitForExist({ timeout: 10000 });
}

export async function seedPatient(name: string): Promise<void> {
  await openManagementModal();
  const card = await $('button[aria-label="Patients"]');
  await card.waitForExist({ timeout: 8000 });
  await card.click();
  await $("#patient-search").waitForExist({ timeout: 10000 });

  await setReactInputValue("add-patient-name", name);
  const submitBtn = await $('button[type="submit"]');
  await submitBtn.waitForEnabled({ timeout: 5000 });
  await submitBtn.click();
  await $(`//td[text()="${name}"]`).waitForExist({ timeout: 10000 });
}

/**
 * Seed a procedure directly via Tauri invoke, bypassing ComboboxField.
 *
 * ComboboxField cannot be automated in WebDriver (isTrusted + floating-ui portal —
 * see ADR 004). This helper creates a procedure at the Tauri command layer so
 * downstream tests (payment, reconciliation, overpayment) can assume a pre-existing
 * procedure without any UI interaction.
 *
 * Prerequisites: the patient and procedure type referenced by patientId and
 * procedureTypeId must already exist in the database (use seedPatient and
 * seedProcedureType first, then read their IDs from the store or UI).
 *
 * Returns the created procedure id.
 */
export async function seedProcedure(
  patientId: string,
  procedureTypeId: string,
  procedureDate: string,
  fundId: string | null = null,
  billedAmount: number | null = null,
): Promise<string> {
  const procedure = await browser.execute(
    async (pId, ptId, date, fId, amount) => {
      // biome-ignore lint/suspicious/noExplicitAny: window.__TAURI_INTERNALS__ is not typed
      const invoke = (window as any).__TAURI_INTERNALS__.invoke as (
        cmd: string,
        args: unknown,
      ) => Promise<unknown>;
      return invoke("add_procedure", {
        patientId: pId,
        fundId: fId,
        procedureTypeId: ptId,
        procedureDate: date,
        billedAmount: amount,
      });
    },
    patientId,
    procedureTypeId,
    procedureDate,
    fundId,
    billedAmount,
  );
  return (procedure as { id: string }).id;
}

