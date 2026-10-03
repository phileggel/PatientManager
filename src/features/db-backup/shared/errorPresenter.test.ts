import { describe, expect, it } from "vitest";
import type { DbBackupError, DiagnosticReportError } from "@/bindings";
import { formatDbBackupError, formatDiagnosticReportError } from "./errorPresenter";

describe("formatDbBackupError", () => {
  it("maps every DbBackupError code to its specific i18n key", () => {
    const cases: Array<[DbBackupError["code"], string]> = [
      ["HomeUnresolved", "db-backup:errors.home_unresolved"],
      ["PathRejected", "db-backup:errors.path_rejected"],
      ["ExportFailed", "db-backup:errors.export_failed"],
      ["ImportFailed", "db-backup:errors.import_failed"],
      ["BackupCorrupted", "db-backup:errors.backup_corrupted"],
    ];
    for (const [code, key] of cases) {
      expect(formatDbBackupError({ code }).key).toBe(key);
    }
  });
});

describe("formatDiagnosticReportError", () => {
  it("test_dgr_015_maps_every_code_to_its_i18n_key", () => {
    const cases: Array<[DiagnosticReportError["code"], string]> = [
      ["HomeUnresolved", "db-backup:errors.home_unresolved"],
      ["PathRejected", "db-backup:errors.path_rejected"],
      ["ReportFailed", "db-backup:errors.report_failed"],
    ];
    for (const [code, key] of cases) {
      expect(formatDiagnosticReportError({ code }).key).toBe(key);
    }
  });
});
