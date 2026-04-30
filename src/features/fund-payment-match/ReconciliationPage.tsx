/**
 * ReconciliationPage - PDF Payment Statement Reconciliation
 *
 * Headless entry point: opens the system file picker on mount, then opens
 * ReconciliationModal on selection. The modal owns the workflow.
 * On picker cancel or modal close, the page calls onClose() to navigate
 * back to the previous route (typically the dashboard).
 */

import { useTranslation } from "react-i18next";
import { ReconciliationModal } from "./reconciliation_modal/ReconciliationModal";
import { useReconciliationPage } from "./useReconciliationPage";

interface ReconciliationPageProps {
  onClose: () => void;
}

export function ReconciliationPage({ onClose }: ReconciliationPageProps) {
  const { t } = useTranslation("fund-payment-match");
  const { selectedFile, isModalOpen, fileInputRef, handleFileSelect, handleClose } =
    useReconciliationPage({ onClose });

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        style={{ display: "none" }}
        aria-label={t("page.uploadAriaLabel")}
      />
      {selectedFile && isModalOpen && (
        <ReconciliationModal file={selectedFile} onClose={handleClose} />
      )}
    </>
  );
}
