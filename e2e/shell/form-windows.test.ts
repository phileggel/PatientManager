import assert from "node:assert";
import { $, browser } from "@wdio/globals";
import { formArea } from "../helpers/layout";
import { openManagementPage } from "../helpers/navigation";

// #738 — under WebKit a form window gave its scrolling area no height: 40 px of
// padding for a few hundred of content. Chromium (the visual proofs) never showed it.
describe("form windows show their fields (#738)", () => {
  it("the procedure window's form is as tall as its content", async () => {
    await browser.keys(["Escape"]);
    const nav = await $("#nav-procedures");
    await nav.waitForClickable({ timeout: 10000 });
    await nav.click();
    const fab = await $("#fab-create-procedure");
    await fab.waitForClickable({ timeout: 10000 });
    await fab.click();
    await $("#procedure-form-modal").waitForDisplayed({ timeout: 5000 });

    const area = await formArea("procedure-form");

    assert.ok(area.content > 100, `the form has content (${area.content} px)`);
    assert.strictEqual(area.shown, area.content, "the whole form shows in an 800 px window");
    await browser.keys(["Escape"]);
  });

  it("a bank entry window's form is as tall as its content", async () => {
    await browser.keys(["Escape"]);
    await openManagementPage("#mgmt-card-direct-payments", "#direct-payment-list");
    const fab = await $("#fab-create-direct-payment");
    await fab.waitForClickable({ timeout: 5000 });
    await fab.click();
    await $("#direct-payment-add-modal").waitForDisplayed({ timeout: 5000 });

    const area = await formArea("direct-payment-add-form");

    assert.ok(area.content > 100, `the form has content (${area.content} px)`);
    assert.strictEqual(area.shown, area.content, "the whole form shows");
    await browser.keys(["Escape"]);
  });
});
