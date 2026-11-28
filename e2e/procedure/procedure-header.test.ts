import assert from "node:assert";
import { $, browser } from "@wdio/globals";
import { overflowPastRight } from "../helpers/layout";

// #752 — the header's single row never wrapped, and its controls and totals were
// cut off on the right. The E2E window is 1200 px wide (`tauri.e2e.conf.json`)
// and the menu starts open (280 px), so the page is about 920 px: narrower than
// that row, even with no procedure.
describe("the procedures page header (#752)", () => {
  it("shows every control and total inside the page", async () => {
    await browser.keys(["Escape"]); // closes what an earlier suite left open
    const nav = await $("#nav-procedures");
    await nav.waitForClickable({ timeout: 10000 });
    await nav.click();
    await $("#procedure-page-header").waitForDisplayed({ timeout: 5000 });

    const overflow = await overflowPastRight("procedure-page-header");

    assert.ok(overflow, "the header is on the page");
    assert.ok(overflow.width < 1000, `the page is narrowed by the menu (${overflow.width} px)`);
    assert.deepStrictEqual(
      { beyond: overflow.beyond, wider: overflow.wider },
      { beyond: [], wider: false },
      `the header fits in ${overflow.width} px; past its edge: ${overflow.beyond.join(", ")}`,
    );
  });
});
