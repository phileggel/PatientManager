import { open, save } from "@tauri-apps/plugin-dialog";
import { commands } from "@/bindings";
import { e2eOverride } from "@/lib/e2e";
import { logger } from "@/lib/logger";

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
 */
export async function exportDatabase(destPath: string): Promise<void> {
  logger.info("[db-backup] exportDatabase");
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
  logger.info("[db-backup] importDatabase");
  const result = await commands.importDatabase(sourcePath);
  if (result.status === "error") {
    throw new Error(result.error);
  }
}
