/**
 * Seed helpers for E2E tests.
 *
 * Each function creates one entity via the UI and waits for confirmation that it
 * persisted. Tests that need prerequisites call these in their `before()` hook.
 *
 * Selectors target stable `id` attributes (locale-invariant) per the project
 * convention — see `docs/e2e-rules.md` and ADR-007. The E2E build runs in
 * mode='e2e' which sets `VITE_LOCALE=en`, but `id` selectors don't depend
 * on the active locale either way.
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

export async function setReactSelectValue(elementId: string, value: string): Promise<void> {
  await browser.execute(
    (id, val) => {
      const el = document.getElementById(id) as HTMLSelectElement | null;
      if (!el) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        "value",
      )?.set;
      nativeSetter?.call(el, val);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    elementId,
    value,
  );
}

export async function readPatientIdByName(name: string): Promise<string> {
  const patients = await browser.execute(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: window.__TAURI_INTERNALS__ is not typed
    const invoke = (window as any).__TAURI_INTERNALS__.invoke as (
      cmd: string,
    ) => Promise<unknown>;
    return invoke("read_all_patients");
  });
  const patient = (patients as { id: string; name: string | null }[]).find(
    (p) => p.name === name,
  );
  if (!patient) throw new Error(`Patient not found: ${name}`);
  return patient.id;
}

export async function readBankAccountIdByName(name: string): Promise<string> {
  const accounts = await browser.execute(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: window.__TAURI_INTERNALS__ is not typed
    const invoke = (window as any).__TAURI_INTERNALS__.invoke as (
      cmd: string,
    ) => Promise<unknown>;
    return invoke("read_all_bank_accounts");
  });
  const account = (accounts as { id: string; name: string }[]).find((a) => a.name === name);
  if (!account) throw new Error(`BankAccount not found: ${name}`);
  return account.id;
}

export async function readProcedureTypeIdByName(name: string): Promise<string> {
  const types = await browser.execute(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: window.__TAURI_INTERNALS__ is not typed
    const invoke = (window as any).__TAURI_INTERNALS__.invoke as (
      cmd: string,
    ) => Promise<unknown>;
    return invoke("read_all_procedure_types");
  });
  const pt = (types as { id: string; name: string }[]).find((t) => t.name === name);
  if (!pt) throw new Error(`ProcedureType not found: ${name}`);
  return pt.id;
}

async function openManagementModal(): Promise<void> {
  await browser.keys(["Escape"]);
  const mgmtBtn = await $("#nav-management");
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();
}

export async function seedBankAccount(name: string): Promise<void> {
  await openManagementModal();
  const card = await $("#mgmt-card-bank-accounts");
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
  const card = await $("#mgmt-card-procedure-types");
  await card.waitForExist({ timeout: 8000 });
  await card.click();
  await $("#procedure-type-search").waitForExist({ timeout: 10000 });

  const fab = await $("#fab-create-procedure-type");
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
  const card = await $("#mgmt-card-patients");
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

