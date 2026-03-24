import { open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { toastService } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { exportDatabase, importDatabase } from "../gateway";

const TAG = "[useDbBackupPanel]";

interface UseDbBackupPanelReturn {
  isExporting: boolean;
  isImporting: boolean;
  isRelaunching: boolean;
  confirmOpen: boolean;
  handleExport: () => Promise<void>;
  handleImportRequest: () => Promise<void>;
  handleImportConfirm: () => Promise<void>;
  handleImportCancel: () => void;
}

/**
 * Hook for the database backup panel.
 * Manages export (R2, R3) and import (R4, R5, R6) flows.
 */
export function useDbBackupPanel(): UseDbBackupPanelReturn {
  const { t } = useTranslation("db-backup");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isRelaunching, setIsRelaunching] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingSourcePath, setPendingSourcePath] = useState<string | null>(null);

  // ── Export (R2, R3) ────────────────────────────────────────────────────────

  const handleExport = async () => {
    // Build default filename with timestamp (R2)
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const defaultFilename = `backup_${timestamp}.db.gz`;

    const destPath = await save({
      title: t("export.dialogTitle"),
      defaultPath: defaultFilename,
      filters: [{ name: "Database backup", extensions: ["gz"] }],
    });

    if (!destPath) return; // user cancelled

    setIsExporting(true);
    try {
      await exportDatabase(destPath);
      toastService.show("success", t("export.success"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(TAG, "export failed", { error: message });
      toastService.show("error", message);
    } finally {
      setIsExporting(false);
    }
  };

  // ── Import (R4, R5, R6) ────────────────────────────────────────────────────

  /** Step 1: open file picker, store path, show confirmation dialog (R4, R5). */
  const handleImportRequest = async () => {
    const sourcePath = await open({
      title: t("import.dialogTitle"),
      multiple: false,
      filters: [{ name: "Database backup", extensions: ["gz"] }],
    });

    if (typeof sourcePath !== "string") return; // user cancelled or unexpected type (W4)

    setPendingSourcePath(sourcePath);
    setConfirmOpen(true);
  };

  /** Step 2: user confirmed — run the import and relaunch (R6). */
  const handleImportConfirm = async () => {
    setConfirmOpen(false);
    if (!pendingSourcePath) return;

    setIsImporting(true);
    try {
      await importDatabase(pendingSourcePath);
      toastService.show("success", t("import.success"));
      setIsRelaunching(true);
      // Relaunch after brief delay so user sees the toast (R6)
      setTimeout(() => {
        relaunch().catch((e) => logger.error(TAG, "relaunch failed", { error: String(e) }));
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(TAG, "import failed", { error: message });
      toastService.show("error", message);
    } finally {
      setIsImporting(false); // W3: always reset, even on success path before relaunch
    }
  };

  const handleImportCancel = () => {
    setConfirmOpen(false);
    setPendingSourcePath(null);
  };

  return {
    isExporting,
    isImporting,
    isRelaunching,
    confirmOpen,
    handleExport,
    handleImportRequest,
    handleImportConfirm,
    handleImportCancel,
  };
}
