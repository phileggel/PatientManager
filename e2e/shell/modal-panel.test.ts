import assert from "node:assert";
import { $, browser } from "@wdio/globals";

/**
 * #693 — a window's panel shows its own background: the page behind no longer
 * shows through its content. jsdom applies no CSS, so the computed background
 * is read here, in the real window.
 */
describe("a window's panel (#693)", () => {
  beforeEach(async () => {
    await browser.keys(["Escape"]);
  });

  it("the management window paints its own background", async () => {
    const managementButton = await $("#nav-management");
    await managementButton.waitForExist({ timeout: 10000 });
    await managementButton.click();
    await $("#management-modal").waitForDisplayed({ timeout: 8000 });

    const background = await browser.execute(() => {
      const panel = document.getElementById("management-modal");
      return panel ? getComputedStyle(panel).backgroundColor : "missing";
    });

    assert.notStrictEqual(background, "missing", "the management window must be open");
    assert.notStrictEqual(
      background,
      "rgba(0, 0, 0, 0)",
      "the panel must not be transparent: the page behind would show through it",
    );

    await browser.keys(["Escape"]);
  });
});
