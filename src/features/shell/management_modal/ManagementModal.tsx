import { ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@/infra/logger";
import { Dialog } from "@/ui/components";
import type { Page } from "../types";
import { type ManagementMenu, useManagementModal } from "./useManagementModal";

const TAG = "[ManagementModal]";

interface ManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
}

/** The `id` of each menu's button (F25, E4). */
const MENU_IDS: Record<ManagementMenu, string> = {
  patients: "mgmt-menu-patients",
  funds_and_procedures: "mgmt-menu-funds-procedures",
  payments: "mgmt-menu-payments",
  bank: "mgmt-menu-bank",
};

/**
 * Management window (#711) — a settings-style menu: four menus on the left, the
 * entries of the chosen one on the right, each opening its page. Opened from the
 * single "Management" entry in the navigation drawer; it always opens on « Patients ».
 */
export function ManagementModal({ isOpen, onClose, onNavigate }: ManagementModalProps) {
  const { t } = useTranslation("management-modal");
  const {
    activeMenu,
    selectMenu,
    handlePatient,
    handlePatientDuplicates,
    handleFunds,
    handleProcedureTypes,
    handleFundPayment,
    handleDirectPayments,
    handleFundWires,
    handleBankAccount,
    handleBankStatementLabels,
  } = useManagementModal({ isOpen, onNavigate, onClose });

  useEffect(() => {
    logger.info(TAG, "mounted");
  }, []);

  useEffect(() => {
    if (isOpen) {
      logger.info(TAG, "opened");
    }
  }, [isOpen]);

  // Each entry: its stable id, its translation keys' prefix, where it leads.
  const menus: { menu: ManagementMenu; entries: [string, string, () => void][] }[] = [
    {
      menu: "patients",
      entries: [
        ["mgmt-card-patients", "patient", handlePatient],
        // PDU-016
        ["mgmt-card-patient-duplicates", "patient_duplicates", handlePatientDuplicates],
      ],
    },
    {
      menu: "funds_and_procedures",
      entries: [
        ["mgmt-card-funds", "funds", handleFunds],
        ["mgmt-card-procedure-types", "procedure_types", handleProcedureTypes],
      ],
    },
    {
      menu: "payments",
      entries: [
        ["mgmt-card-fund-payment", "fund_payment", handleFundPayment],
        // #642
        ["mgmt-card-direct-payments", "direct_payments", handleDirectPayments],
        ["mgmt-card-fund-wires", "fund_wires", handleFundWires],
      ],
    },
    {
      menu: "bank",
      entries: [
        ["mgmt-card-bank-accounts", "bank_account", handleBankAccount],
        // BAS-041
        ["mgmt-card-bank-statement-labels", "bank_statement_label", handleBankStatementLabels],
      ],
    },
  ];
  const entries = menus.find((m) => m.menu === activeMenu)?.entries ?? [];

  return (
    <Dialog
      id="management-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={t("modal_title")}
      maxWidth="max-w-2xl"
    >
      <div className="flex min-h-[320px] gap-3 pb-2">
        <nav aria-label={t("modal_title")} className="flex w-48 shrink-0 flex-col gap-1">
          {menus.map(({ menu }) => (
            <button
              key={menu}
              id={MENU_IDS[menu]}
              type="button"
              aria-current={menu === activeMenu ? "true" : undefined}
              onClick={() => selectMenu(menu)}
              className={`w-full rounded-full px-4 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-m3-primary ${
                menu === activeMenu
                  ? "bg-m3-secondary-container text-m3-on-secondary-container"
                  : "text-m3-on-surface-variant hover:bg-m3-surface-container-high"
              }`}
            >
              {t(`menu.${menu}`)}
            </button>
          ))}
        </nav>
        <div className="flex flex-1 flex-col gap-1 rounded-2xl bg-m3-surface-container-low p-2">
          {entries.map(([id, key, onClick]) => (
            <button
              key={id}
              id={id}
              type="button"
              onClick={onClick}
              aria-label={t(`${key}.title`)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-m3-surface-container-high active:bg-m3-surface-container-highest focus-visible:outline focus-visible:outline-2 focus-visible:outline-m3-primary focus-visible:-outline-offset-2"
            >
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-m3-on-surface">{t(`${key}.title`)}</span>
                <span className="text-sm leading-relaxed text-m3-on-surface-variant">
                  {t(`${key}.description`)}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-m3-on-surface-variant" />
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
