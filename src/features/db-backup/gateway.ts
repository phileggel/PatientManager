import { commands } from "@/bindings";
import { logger } from "@/lib/logger";

// ── Database Backup ──────────────────────────────────────────────────────────

/**
 * Exports the active database to `destPath` as a gzip-compressed SQLite file (R7, R8).
 * The path is obtained from a native save-file dialog before calling this function.
 */
export async function exportDatabase(destPath: string): Promise<void> {
  logger.info("[db-backup] exportDatabase", { destPath });
  const result = await commands.exportDatabase(destPath);
  if (result.status === "error") {
    throw new Error(result.error);
  }
}

/**
 * Decompresses, validates, and stages the backup at `sourcePath` as a pending
 * import (R9, R10). The caller is responsible for relaunching the app after
 * this resolves (R6).
 */
export async function importDatabase(sourcePath: string): Promise<void> {
  logger.info("[db-backup] importDatabase", { sourcePath });
  const result = await commands.importDatabase(sourcePath);
  if (result.status === "error") {
    throw new Error(result.error);
  }
}
