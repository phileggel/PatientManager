/**
 * FundsManager - Fund Management Page
 *
 * ARCHITECTURE:
 * - useFundManager: reads fund count from store for display
 * - FundList: reads full fund data and renders table
 * - Event-driven updates via useAppInit (Tauri event listener)
 * - No manual refresh or polling needed
 */

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@/lib/logger";
import { ManagerLayout } from "@/ui/components";
import { AddFundPanel } from "./add_fund_panel/AddFundPanel";
import { FundList } from "./fund_list/FundList";
import { useFundManager } from "./useFundManager";

export function FundsManager() {
  const { t } = useTranslation("fund");
  const { count } = useFundManager();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    logger.info("[FundsManager] Page mounted");
  }, []);

  return (
    <ManagerLayout
      searchId="fund-search"
      title={t("page.title")}
      count={count}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("page.searchPlaceholder")}
      table={<FundList searchTerm={searchTerm} />}
      sidePanelTitle={t("action.add")}
      sidePanelIcon={<Plus size={24} strokeWidth={2.5} />}
      sidePanelDescription={t("page.addDescription")}
      sidePanelContent={<AddFundPanel />}
    />
  );
}
