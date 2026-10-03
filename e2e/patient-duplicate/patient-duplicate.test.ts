import assert from "node:assert";
import { $, browser } from "@wdio/globals";
import { tauriInvoke } from "../helpers/tauri-invoke";

// Seeding goes through the real commands (no mock). Each scenario has its own pair
// of same-name patients and opens the page itself.

interface Pair {
  name: string;
  first: { id: string };
  second: { id: string };
}

async function seedPair(name: string): Promise<Pair> {
  for (const spelling of [name, name.toUpperCase()]) {
    const added = await tauriInvoke<{ id: string }>("add_patient", {
      name: spelling,
      ssn: null,
    });
    assert.ok(added.ok, `add_patient failed: ${added.ok ? "" : added.error}`);
  }
  const pair = (await listPairs()).find((p) => p.name.toLowerCase() === name.toLowerCase());
  assert.ok(pair, "the two same-name patients should be proposed as a pair");
  return pair;
}

async function listPairs(): Promise<Pair[]> {
  const pairs = await tauriInvoke<Pair[]>("list_patient_duplicates", {});
  assert.ok(pairs.ok, `list_patient_duplicates failed: ${pairs.ok ? "" : pairs.error}`);
  return pairs.data;
}

async function openFromManagement(cardId: string, pageId: string): Promise<void> {
  const mgmtBtn = await $("#nav-management");
  await mgmtBtn.waitForExist({ timeout: 10000 });
  await mgmtBtn.click();
  const card = await $(cardId);
  await card.waitForExist({ timeout: 8000 });
  await card.click();
  await $(pageId).waitForExist({ timeout: 10000 });
}

async function openDuplicatesPage(): Promise<void> {
  // Close any dialog a previous suite left open (shared WebView session).
  await browser.keys(["Escape"]);
  // Through another page first, so that the page loads the pairs seeded since.
  await openFromManagement("#mgmt-card-patients", "#patient-list");
  await openFromManagement("#mgmt-card-patient-duplicates", "#patient-duplicate-list");
}

describe("patient duplicates", () => {
  // Unique per run: a database kept between runs must not add pairs under these names.
  const run = Math.random().toString(36).slice(2, 8);
  let distinct: Pair;
  let merged: Pair;

  before(async () => {
    distinct = await seedPair(`E2E Doublon Distinct ${run}`);
    merged = await seedPair(`E2E Doublon Fusion ${run}`);
  });

  beforeEach(async () => {
    await openDuplicatesPage();
  });

  it("PDU-030: « Pas un doublon » removes the pair from the list for good", async () => {
    const id = `${distinct.first.id}-${distinct.second.id}`;

    const row = await $(`#patient-duplicate-row-${id}`);
    await row.waitForExist({ timeout: 10000 });
    await (await $(`#patient-duplicate-dismiss-${id}`)).click();

    await row.waitForExist({ timeout: 10000, reverse: true });
    const left = (await listPairs()).some((p) => p.first.id === distinct.first.id);
    assert.ok(!left, "a dismissed pair should not be proposed again");
  });

  it("PDU-020, PDU-021: « Fusionner » keeps the chosen patient and deletes the other", async () => {
    const id = `${merged.first.id}-${merged.second.id}`;

    const row = await $(`#patient-duplicate-row-${id}`);
    await row.waitForExist({ timeout: 10000 });
    await (await $(`#patient-duplicate-merge-${id}`)).click();
    // The first patient is preselected: keep the second instead.
    const second = await $("#patient-duplicate-merge-choice-second");
    await second.waitForClickable({ timeout: 5000 });
    await second.click();
    await (await $("#patient-duplicate-merge-confirm")).click();

    await row.waitForExist({ timeout: 10000, reverse: true });
    const patients = await tauriInvoke<{ id: string }[]>("read_all_patients", {});
    assert.ok(patients.ok, `read_all_patients failed: ${patients.ok ? "" : patients.error}`);
    const ids = patients.data.map((p) => p.id);
    assert.ok(ids.includes(merged.second.id), "the kept patient should still exist");
    assert.ok(!ids.includes(merged.first.id), "the other patient should be deleted");
  });
});
