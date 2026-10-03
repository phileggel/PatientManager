/**
 * E2E — diagnostic report (DGR-010, DGR-011, DGR-014, DGR-020, DGR-021).
 *
 * Maintenance entry → database backup dialog → « Générer le rapport » → the
 * section shows the saved file and its support code, and the file on disk
 * carries that code. The native save dialog is bypassed with ADR-007's
 * `pickDiagnosticReportPath` override; the report is written by the real
 * command, under the home directory where the backend accepts a destination.
 */

import { $, browser } from "@wdio/globals";
import assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { clearE2eOverrides, setE2eOverrides } from "../helpers/e2e";

describe("Diagnostic report", () => {
  let workDir: string;
  let reportPath: string;

  before(async () => {
    workDir = mkdtempSync(join(os.homedir(), ".patient-manager-e2e-"));
    reportPath = join(workDir, "diagnostic.txt");
    await $("#nav-db-backup").waitForExist({ timeout: 10000 });
    await setE2eOverrides({ pickDiagnosticReportPath: reportPath });
  });

  after(async () => {
    await clearE2eOverrides();
    // maxInstances: 1 — never leak an open modal into the next spec.
    await browser.keys("Escape");
    rmSync(workDir, { recursive: true, force: true });
  });

  it("saves a report and shows its file name and support code", async () => {
    await browser.keys("Escape");
    await $("#nav-db-backup").click();
    await $("#db-backup-modal").waitForExist({ timeout: 8000 });

    const generate = await $("#diagnostic-report-generate");
    await generate.waitForEnabled({ timeout: 8000 });
    await generate.click();

    const saved = await $("#diagnostic-report-saved");
    await saved.waitForExist({ timeout: 15000 });
    assert.ok(
      (await saved.getText()).includes("diagnostic.txt"),
      "the section names the saved file",
    );
    const code = await $("#diagnostic-report-code").getText();
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/, "the support code has two groups of four");

    const report = readFileSync(reportPath, "utf8");
    assert.ok(report.includes(`Support code: ${code}`), "the file carries the code shown");
    assert.ok(report.includes("== Row counts =="), "the file carries the database sections");
  });
});
