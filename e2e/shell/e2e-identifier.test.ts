import assert from "node:assert";
import { tauriInvoke } from "../helpers/tauri-invoke";

// #766 — the E2E build had the real application's identifier, so its data and
// log folders were the real ones: a local run wrote, and could empty the log, there.
describe("the E2E build (#766)", () => {
  it("has an identifier of its own, so folders of its own", async () => {
    const identifier = await tauriInvoke<string>("plugin:app|identifier", {});

    assert.ok(identifier.ok, `the identifier is read: ${identifier.ok ? "" : identifier.error}`);
    assert.ok(identifier.data.endsWith(".e2e"), `the E2E identifier is ${identifier.data}`);
  });
});
