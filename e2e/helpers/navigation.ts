/**
 * Navigation helpers shared by the E2E suites (FLOW-020).
 *
 * Selectors target stable `id` attributes — locale-invariant per ADR-007.
 */
import { $ } from "@wdio/globals";

/**
 * Open a management page: the side rail's management entry, then the page's
 * card, and wait until `readySelector` — an element only that page renders —
 * exists.
 */
export async function openManagementPage(cardId: string, readySelector: string): Promise<void> {
  const mgmtBtn = await $("#nav-management");
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();

  const card = await $(cardId);
  await card.waitForExist({ timeout: 8000 });
  await card.click();

  await $(readySelector).waitForExist({ timeout: 10000 });
}
