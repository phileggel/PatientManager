/**
 * Navigation helpers shared by the E2E suites (FLOW-020).
 *
 * Selectors target stable `id` attributes — locale-invariant (E4).
 */
import { $, browser } from "@wdio/globals";
import type { ChainablePromiseElement } from "webdriverio";

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

/**
 * Click an element of a list that is redrawn while it loads: the element is looked
 * up again on every try, so a reference gone stale between the lookup and the click
 * is not an error. `selector` is an `id` selector (E4).
 */
export async function clickWhenSettled(selector: string, timeout = 8000): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const element = await $(selector);
        if (!(await element.isExisting())) return false;
        await element.click();
        return true;
      } catch {
        return false;
      }
    },
    { timeout, timeoutMsg: `${selector} could not be clicked within ${timeout} ms` },
  );
}

/**
 * Wait until `lookup` finds nothing (E10). WebKitWebDriver can answer the lookup of a
 * node removed mid-query with a stale-element error instead of « none » (#764): that
 * error means the node is going, so the wait goes on; any other error is thrown.
 * `lookup` is called again on every try; `what` names the element in the failure.
 */
export async function waitUntilGone(
  lookup: () => ChainablePromiseElement,
  timeout: number,
  what: string,
): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        return !(await lookup().isExisting());
      } catch (error) {
        if (/stale element/i.test(String(error))) return false;
        throw error;
      }
    },
    { timeout, timeoutMsg: `${what} was still there after ${timeout} ms` },
  );
}
