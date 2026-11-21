/**
 * Navigation helpers shared by the E2E suites (FLOW-020).
 *
 * Selectors target stable `id` attributes — locale-invariant (E4).
 */
import { $ } from "@wdio/globals";

/** #711 — the menu of the management window that holds each entry. */
const MENU_OF_ENTRY: Record<string, string> = {
  "#mgmt-card-patients": "#mgmt-menu-patients",
  "#mgmt-card-patient-duplicates": "#mgmt-menu-patients",
  "#mgmt-card-funds": "#mgmt-menu-funds-procedures",
  "#mgmt-card-procedure-types": "#mgmt-menu-funds-procedures",
  "#mgmt-card-fund-payment": "#mgmt-menu-payments",
  "#mgmt-card-direct-payments": "#mgmt-menu-payments",
  "#mgmt-card-fund-wires": "#mgmt-menu-payments",
  "#mgmt-card-bank-accounts": "#mgmt-menu-bank",
  "#mgmt-card-bank-statement-labels": "#mgmt-menu-bank",
};

/**
 * Open a management page: the side rail's management entry, the menu that holds
 * the page's entry, then that entry, and wait until `readySelector` — an element
 * only that page renders — exists.
 */
export async function openManagementPage(cardId: string, readySelector: string): Promise<void> {
  const mgmtBtn = await $("#nav-management");
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();

  const menuId = MENU_OF_ENTRY[cardId];
  if (!menuId) throw new Error(`No management menu holds ${cardId}`);
  const menu = await $(menuId);
  await menu.waitForExist({ timeout: 8000 });
  await menu.click();

  const card = await $(cardId);
  await card.waitForExist({ timeout: 8000 });
  await card.click();

  await $(readySelector).waitForExist({ timeout: 10000 });
}
