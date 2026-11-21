import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCacheStore } from "@/infra/cache/store";
import { toastService } from "@/ui/components/snackbar";
import type { Page } from "../types";

/** #711 — the four menus of the management window. */
export type ManagementMenu = "patients" | "funds_and_procedures" | "payments" | "bank";

interface UseManagementModalProps {
  /** The window reopens on its first menu; absent, the menu is simply kept. */
  isOpen?: boolean;
  onNavigate: (page: Page) => void;
  onClose: () => void;
}

interface UseManagementModalReturn {
  activeMenu: ManagementMenu;
  selectMenu: (menu: ManagementMenu) => void;
  handlePatient: () => void;
  handlePatientDuplicates: () => void;
  handleFunds: () => void;
  handleProcedureTypes: () => void;
  handleFundPayment: () => void;
  handleDirectPayments: () => void;
  handleFundWires: () => void;
  handleBankAccount: () => void;
  handleBankStatementLabels: () => void;
}

/**
 * Hook for the management modal: the menu shown (#711) and where each entry leads.
 * Checks the funds prerequisite before navigating to fund-payment.
 */
export function useManagementModal({
  isOpen,
  onNavigate,
  onClose,
}: UseManagementModalProps): UseManagementModalReturn {
  const { t } = useTranslation("management-modal");
  const fundCount = useCacheStore((state) => state.funds.length);
  const [activeMenu, setActiveMenu] = useState<ManagementMenu>("patients");

  // #711 — the window always opens on « Patients »: no menu is remembered.
  useEffect(() => {
    if (isOpen) setActiveMenu("patients");
  }, [isOpen]);

  const handlePatient = useCallback(() => {
    onNavigate("patient");
    onClose();
  }, [onNavigate, onClose]);

  const handleFunds = useCallback(() => {
    onNavigate("funds");
    onClose();
  }, [onNavigate, onClose]);

  const handleProcedureTypes = useCallback(() => {
    onNavigate("procedure-types");
    onClose();
  }, [onNavigate, onClose]);

  const handleFundPayment = useCallback(() => {
    if (fundCount === 0) {
      toastService.show("info", t("prerequisites.no_fund"));
      onNavigate("funds");
    } else {
      onNavigate("fund-payment");
    }
    onClose();
  }, [fundCount, onNavigate, onClose, t]);

  // #642 — a direct payment needs no account (BAC-056): its page opens with none (#518).
  const handleDirectPayments = useCallback(() => {
    onNavigate("direct-payments");
    onClose();
  }, [onNavigate, onClose]);

  const handleFundWires = useCallback(() => {
    onNavigate("fund-wires");
    onClose();
  }, [onNavigate, onClose]);

  const handleBankAccount = useCallback(() => {
    onNavigate("bank-account");
    onClose();
  }, [onNavigate, onClose]);

  const handlePatientDuplicates = useCallback(() => {
    onNavigate("patient-duplicate");
    onClose();
  }, [onNavigate, onClose]);

  const handleBankStatementLabels = useCallback(() => {
    onNavigate("bank-statement-label");
    onClose();
  }, [onNavigate, onClose]);

  return {
    activeMenu,
    selectMenu: setActiveMenu,
    handlePatient,
    handlePatientDuplicates,
    handleFunds,
    handleProcedureTypes,
    handleFundPayment,
    handleDirectPayments,
    handleFundWires,
    handleBankAccount,
    handleBankStatementLabels,
  };
}
