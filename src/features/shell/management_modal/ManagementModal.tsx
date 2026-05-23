import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@/infra/logger";
import { Dialog } from "@/ui/components";
import type { Page } from "../types";
import { useManagementModal } from "./useManagementModal";

const TAG = "[ManagementModal]";

interface ManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
}

/**
 * Management modal — presents the six list management entry points.
 * Opened from the single "Management" entry in the navigation drawer.
 */
export function ManagementModal({ isOpen, onClose, onNavigate }: ManagementModalProps) {
  const { t } = useTranslation("management-modal");
  const {
    handlePatient,
    handleFunds,
    handleProcedureTypes,
    handleFundPayment,
    handleBankTransfer,
    handleBankAccount,
  } = useManagementModal({ onNavigate, onClose });

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
    <Dialog
      id="management-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={t("modalTitle")}
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-3 pb-2">
        {/* Patients */}
        <button
          id="mgmt-card-patients"
          type="button"
          className={cardClasses}
          onClick={handlePatient}
          aria-label={t("patient.title")}
        >
          <span className="text-sm font-medium text-m3-on-surface">{t("patient.title")}</span>
          <p className="text-sm text-m3-on-surface-variant leading-relaxed">
            {t("patient.description")}
          </p>
        </button>

        {/* Funds */}
        <button
          id="mgmt-card-funds"
          type="button"
          className={cardClasses}
          onClick={handleFunds}
          aria-label={t("funds.title")}
        >
          <span className="text-sm font-medium text-m3-on-surface">{t("funds.title")}</span>
          <p className="text-sm text-m3-on-surface-variant leading-relaxed">
            {t("funds.description")}
          </p>
        </button>

        {/* Procedure Types */}
        <button
          id="mgmt-card-procedure-types"
          type="button"
          className={cardClasses}
          onClick={handleProcedureTypes}
          aria-label={t("procedureTypes.title")}
        >
          <span className="text-sm font-medium text-m3-on-surface">
            {t("procedureTypes.title")}
          </span>
          <p className="text-sm text-m3-on-surface-variant leading-relaxed">
            {t("procedureTypes.description")}
          </p>
        </button>

        {/* Fund Payment */}
        <button
          id="mgmt-card-fund-payment"
          type="button"
          className={cardClasses}
          onClick={handleFundPayment}
          aria-label={t("fundPayment.title")}
        >
          <span className="text-sm font-medium text-m3-on-surface">{t("fundPayment.title")}</span>
          <p className="text-sm text-m3-on-surface-variant leading-relaxed">
            {t("fundPayment.description")}
          </p>
        </button>

        {/* Bank Transfer */}
        <button
          id="mgmt-card-bank-transfers"
          type="button"
          className={cardClasses}
          onClick={handleBankTransfer}
          aria-label={t("bankTransfer.title")}
        >
          <span className="text-sm font-medium text-m3-on-surface">{t("bankTransfer.title")}</span>
          <p className="text-sm text-m3-on-surface-variant leading-relaxed">
            {t("bankTransfer.description")}
          </p>
        </button>

        {/* Bank Accounts */}
        <button
          id="mgmt-card-bank-accounts"
          type="button"
          className={cardClasses}
          onClick={handleBankAccount}
          aria-label={t("bankAccount.title")}
        >
          <span className="text-sm font-medium text-m3-on-surface">{t("bankAccount.title")}</span>
          <p className="text-sm text-m3-on-surface-variant leading-relaxed">
            {t("bankAccount.description")}
          </p>
        </button>
      </div>
    </Dialog>
  );
}
