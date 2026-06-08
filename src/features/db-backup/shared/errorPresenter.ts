import type { DbBackupError } from "@/bindings";

/**
 * Layer 3 of the F27 typed-error pipeline for the database-backup use case.
 * Pure `code → { key }` mapping over the flat `DbBackupError` enum. The caller
 * (Layer 4) calls `t(key)`. No runtime dependency on i18next.
 *
 * Exhaustive over the union (no `default`), so a new wire variant fails to
 * compile here rather than silently dropping.
 */
export function formatDbBackupError(err: DbBackupError): { key: string } {
  switch (err.code) {
    case "HomeUnresolved":
      return { key: "db-backup:errors.home_unresolved" };
    case "PathRejected":
      return { key: "db-backup:errors.path_rejected" };
    case "ExportFailed":
      return { key: "db-backup:errors.export_failed" };
    case "ImportFailed":
      return { key: "db-backup:errors.import_failed" };
    case "BackupCorrupted":
      return { key: "db-backup:errors.backup_corrupted" };
  }
}
