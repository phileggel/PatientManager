/**
 * BankAccountManager - Bank Account Management Page
 *
 * ARCHITECTURE:
 * - useBankAccountManager: reads account count from store for display
 * - BankAccountList: reads full account data and renders table with sorting/filtering
 * - AddBankAccountPanel: smart component for adding new accounts
 * - Event-driven updates via useAppInit (Tauri event listener)
 * - No manual refresh or polling needed
 *
 * FEEDBACK STRATEGY:
 * - Validation errors: inline on form fields
 * - Operation success/errors: via snackbar (shown by components directly)
 * - No callbacks needed - components are self-contained
 */

import { Landmark } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@/lib/logger";
import { ManagerLayout } from "@/ui/components";
import { AddBankAccountPanel } from "./add_bank_account_panel/AddBankAccountPanel";
import { BankAccountList } from "./bank_account_list/BankAccountList";
import { useBankAccountManager } from "./useBankAccountManager";

export function BankAccountManager() {
  const { t } = useTranslation("bank");
  const { count } = useBankAccountManager();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    logger.info("[BankAccountManager] Page mounted");
  }, []);

  return (
    <ManagerLayout
      searchId="bank-account-search"
      title={t("account.manager.title")}
      count={count}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("account.manager.searchPlaceholder")}
      table={<BankAccountList searchTerm={searchTerm} />}
      sidePanelTitle={t("account.manager.panelTitle")}
      sidePanelIcon={<Landmark size={24} strokeWidth={2.5} />}
      sidePanelDescription={t("account.manager.panelDescription")}
      sidePanelContent={<AddBankAccountPanel />}
    />
  );
}
