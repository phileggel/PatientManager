/**
 * ReconciliationPage - PDF Payment Statement Reconciliation
 *
 * Entry point for the reconciliation workflow.
 * Opens ReconciliationModal on file selection; modal handles all further steps.
 */

import { FileText } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components/button";
import { ReconciliationModal } from "./reconciliation_modal/ReconciliationModal";
import { useReconciliationPage } from "./useReconciliationPage";

const TAG = "[ReconciliationPage]";

export function ReconciliationPage() {
  const { t } = useTranslation("fund-payment-match");

  useEffect(() => {
    logger.info(TAG, "Component mounted");
  }, []);

  const {
    selectedFile,
    isModalOpen,
    fileInputRef,
    handleFileSelect,
    handleModalClose,
    handleUploadClick,
  } = useReconciliationPage();

  return (
    <div className="flex flex-col h-full w-full">
      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
        <div className="text-center space-y-4">
          <FileText className="w-16 h-16 mx-auto text-primary-60" />
          <h2 className="text-2xl font-semibold text-slate-900">{t("page.title")}</h2>
          <p className="text-slate-600 max-w-md">{t("page.subtitle")}</p>
        </div>

        <Button onClick={handleUploadClick} variant="primary" size="lg">
          {t("page.selectButton")}
        </Button>

        <p className="text-sm text-slate-500 text-center">
          {t("page.formats")}
          <br />
          {t("page.maxSize")}
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        style={{ display: "none" }}
        aria-label={t("page.uploadAriaLabel")}
      />

      {/* Reconciliation Modal */}
      {selectedFile && isModalOpen && (
        <ReconciliationModal file={selectedFile} onClose={handleModalClose} />
      )}
    </div>
  );
}
