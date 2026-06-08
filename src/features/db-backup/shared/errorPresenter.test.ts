import { describe, expect, it } from "vitest";
import type { DbBackupError } from "@/bindings";
import { formatDbBackupError } from "./errorPresenter";

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
