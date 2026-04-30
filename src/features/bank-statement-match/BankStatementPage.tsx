/**
 * BankStatementPage - PDF Bank Statement Reconciliation
 *
 * Headless entry point: opens the system file picker on mount, then opens
 * BankStatementModal on selection. The modal owns the workflow.
 * On picker cancel or modal close, the page calls onClose() to navigate
 * back to the previous route (typically the dashboard).
 */

import { useTranslation } from "react-i18next";
import { BankStatementModal } from "./ui/BankStatementModal";
import { useBankStatementPage } from "./useBankStatementPage";

interface BankStatementPageProps {
  onClose: () => void;
}

export function BankStatementPage({ onClose }: BankStatementPageProps) {
  const { t } = useTranslation("bank");
  const { selectedFile, isModalOpen, fileInputRef, handleFileSelect, handleClose } =
    useBankStatementPage({ onClose });

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        style={{ display: "none" }}
        aria-label={t("statement.uploadAriaLabel")}
      />
      {selectedFile && isModalOpen && (
        <BankStatementModal file={selectedFile} onClose={handleClose} />
      )}
    </>
  );
}
