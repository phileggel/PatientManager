import { open, save } from "@tauri-apps/plugin-dialog";
import { commands, type DbBackupError } from "@/bindings";
import { logger } from "@/infra/logger";
import { e2eOverride } from "@/lib/e2e";
import type { ServiceResult } from "@/types/api";

// ── Native file-picker dialogs ────────────────────────────────────────────────

export async function pickExportPath(title: string, defaultPath: string): Promise<string | null> {
  return e2eOverride("pickExportPath", async () =>
    save({
      title,
      defaultPath,
      filters: [{ name: "Database backup", extensions: ["gz"] }],
    }),
  );
}

export async function pickImportPath(title: string, defaultPath?: string): Promise<string | null> {
  return e2eOverride("pickImportPath", async () => {
    const result = await open({
      title,
      multiple: false,
      defaultPath,
      filters: [{ name: "Database backup", extensions: ["gz"] }],
    });
    if (typeof result !== "string") return null;
    return result;
  });
}

// ── Database Backup ──────────────────────────────────────────────────────────

/**
 * Exports the active database to `destPath` as a gzip-compressed SQLite file (R7, R8).
 * The path is obtained from a native save-file dialog before calling this function.
 *
 * @returns the typed error on failure (F27 pass-through — never throws).
 */
export async function exportDatabase(
  destPath: string,
): Promise<ServiceResult<void, DbBackupError>> {
  logger.info("[db-backup] exportDatabase");
  const result = await commands.exportDatabase(destPath);
  if (result.status === "error") {
    logger.error("[db-backup] exportDatabase failed", result.error);
    return { success: false, error: result.error };
  }
  return { success: true, data: undefined };
}

/**
 * Decompresses, validates, and stages the backup at `sourcePath` as a pending
 * import (R9, R10). The caller is responsible for relaunching the app after
 * this resolves (R6).
 *
 * @returns the typed error on failure (F27 pass-through — never throws).
 */
export async function importDatabase(
  sourcePath: string,
): Promise<ServiceResult<void, DbBackupError>> {
  logger.info("[db-backup] importDatabase");
  const result = await commands.importDatabase(sourcePath);
  if (result.status === "error") {
    logger.error("[db-backup] importDatabase failed", result.error);
    return { success: false, error: result.error };
  }
  return { success: true, data: undefined };
}
