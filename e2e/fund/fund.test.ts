import { browser, $ } from "@wdio/globals";
import assert from "node:assert";
import { setReactInputValue } from "../helpers/seed";

const FUND_IDENTIFIER = "E2E-SMOKE";
const FUND_NAME = "E2E Smoke Fund";

async function navigateToFunds(): Promise<void> {
  // Selectors target stable `id` attributes — locale-invariant per ADR-007.
  const mgmtBtn = await $("#nav-management");
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();

  const fundCard = await $("#mgmt-card-funds");
  await fundCard.waitForExist({ timeout: 8000 });
  await fundCard.click();

  const searchInput = await $("#fund-search");
  await searchInput.waitForExist({ timeout: 10000 });
}

describe("fund smoke", () => {
  beforeEach(async () => {
    await browser.keys(["Escape"]);
    await navigateToFunds();
  });

  it("fund page renders with search input", async () => {
    const searchInput = await $("#fund-search");
    assert.ok(await searchInput.isExisting(), "FundsManager should render with search input");
  });

  it("create_fund: new fund appears in list after submit", async () => {
    await setReactInputValue("add-fund-identifier", FUND_IDENTIFIER);
    await setReactInputValue("add-fund-name", FUND_NAME);

    const submitBtn = await $('button[type="submit"]');
    await submitBtn.waitForEnabled({ timeout: 5000 });
    await submitBtn.click();

    const newRow = await $(`//td[text()="${FUND_IDENTIFIER}"]`);
    await newRow.waitForExist({ timeout: 10000 });
    assert.ok(await newRow.isExisting(), "Newly created fund should be visible in list");
  });
});
