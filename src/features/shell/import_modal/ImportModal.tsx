import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@/lib/logger";
import { Dialog } from "@/ui/components";
import type { Page } from "../types";
import { useImportModal } from "./useImportModal";

const TAG = "[ImportModal]";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
}

/**
 * Unified import modal — presents three import entry points (Excel, Fund, Bank).
 * Opened from the single "Importer" entry in the navigation drawer.
 */
export function ImportModal({ isOpen, onClose, onNavigate }: ImportModalProps) {
  const { t } = useTranslation("import-modal");
  const { handleExcelImport, handleFundReconciliation, handleBankReconciliation } = useImportModal({
    onNavigate,
    onClose,
  });

  useEffect(() => {
    logger.info(TAG, "mounted");
  }, []);

  useEffect(() => {
    if (isOpen) {
      logger.info(TAG, "opened");
    }
  }, [isOpen]);

  const cardClasses =
    "w-full text-left flex flex-col gap-1.5 p-4 rounded-xl border border-m3-outline-variant/40 bg-m3-surface-container-high hover:bg-m3-surface-container-highest active:bg-m3-surface-container-highest transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-m3-primary focus-visible:-outline-offset-2";

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={t("modalTitle")} maxWidth="max-w-lg">
      <div className="flex flex-col gap-3 pb-2">
        {/* Excel import */}
        <button type="button" className={cardClasses} onClick={handleExcelImport}>
          <span className="text-sm font-medium text-m3-on-surface">{t("excel.title")}</span>
          <p className="text-sm text-m3-on-surface-variant leading-relaxed">
            {t("excel.description")}
          </p>
        </button>

        {/* Fund reconciliation */}
        <button type="button" className={cardClasses} onClick={handleFundReconciliation}>
          <span className="text-sm font-medium text-m3-on-surface">
            {t("fundReconciliation.title")}
          </span>
          <p className="text-sm text-m3-on-surface-variant leading-relaxed">
            {t("fundReconciliation.description")}
          </p>
        </button>

        {/* Bank reconciliation */}
        <button type="button" className={cardClasses} onClick={handleBankReconciliation}>
          <span className="text-sm font-medium text-m3-on-surface">
            {t("bankReconciliation.title")}
          </span>
          <p className="text-sm text-m3-on-surface-variant leading-relaxed">
            {t("bankReconciliation.description")}
          </p>
        </button>
      </div>
    </Dialog>
  );
}
