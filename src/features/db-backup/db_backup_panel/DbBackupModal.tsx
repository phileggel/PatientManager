import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { Button, ConfirmationDialog, Dialog } from "@/ui/components";
import { useDbBackupPanel } from "./useDbBackupPanel";

const TAG = "[DbBackupModal]";

interface DbBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Database backup modal — export and import (R1–R6).
 * Opened from the Maintenance section of the navigation drawer.
 */
export function DbBackupModal({ isOpen, onClose }: DbBackupModalProps) {
  const { t } = useTranslation("db-backup");
  const {
    isExporting,
    isImporting,
    isRelaunching,
    confirmOpen,
    handleExport,
    handleImportRequest,
    handleImportConfirm,
    handleImportCancel,
  } = useDbBackupPanel();

  const isBusy = isExporting || isImporting || isRelaunching;

  const progressMessage = isRelaunching
    ? t("import.relaunching")
    : isExporting
      ? t("export.progress")
      : t("import.progress");

  useEffect(() => {
    if (isOpen) {
      logger.info(TAG, "opened");
    }
  }, [isOpen]);

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        title={t("modalTitle")}
        maxWidth="max-w-lg"
        disableClose={isBusy}
      >
        <div className={`flex flex-col gap-8 pb-2 ${isBusy ? "cursor-wait" : ""}`}>
          {/* Export section */}
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-base font-medium text-m3-on-surface">{t("export.title")}</h3>
              <p className="mt-1 text-sm text-m3-on-surface-variant leading-relaxed">
                {t("export.description")}
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={handleExport}
                loading={isExporting}
                disabled={isBusy}
              >
                {t("export.button")}
              </Button>
            </div>
          </div>

          {/* Import section */}
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-base font-medium text-m3-on-surface">{t("import.title")}</h3>
              <p className="mt-1 text-sm text-m3-on-surface-variant leading-relaxed">
                {t("import.description")}
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="danger"
                onClick={handleImportRequest}
                loading={isImporting}
                disabled={isBusy}
              >
                {t("import.button")}
              </Button>
            </div>
          </div>

          {/* Progress indicator — visible during export, import, and relaunch wait */}
          {isBusy && (
            <div className="flex items-center gap-3 py-1 text-m3-on-surface-variant">
              <Loader2 size={16} className="animate-spin text-m3-primary shrink-0" />
              <span className="text-sm">{progressMessage}</span>
            </div>
          )}
        </div>
      </Dialog>

      {/* Confirmation dialog rendered outside Dialog to avoid z-index nesting issues */}
      <ConfirmationDialog
        isOpen={confirmOpen}
        onCancel={handleImportCancel}
        onConfirm={handleImportConfirm}
        title={t("import.confirm.title")}
        message={t("import.confirm.message")}
        confirmLabel={t("import.confirm.confirm")}
        cancelLabel={t("import.confirm.cancel")}
        variant="danger"
      />
    </>
  );
}
