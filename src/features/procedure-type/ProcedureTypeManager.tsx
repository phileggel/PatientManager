/**
 * ProcedureTypeManager - Procedure Type Management Page
 *
 * ARCHITECTURE:
 * - useProcedureTypeManager: reads procedure type count from store for display
 * - ProcedureTypeList: reads full procedure type data and renders table
 * - Event-driven updates via useAppInit (Tauri event listener)
 * - No manual refresh or polling needed
 */

import { Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { ManagerLayout } from "@/ui/components";
import { AddProcedureTypePanel } from "./add_procedure_type_panel/AddProcedureTypePanel";
import { ProcedureTypeList } from "./procedure_type_list/ProcedureTypeList";
import { useProcedureTypeManager } from "./useProcedureTypeManager";

export function ProcedureTypeManager() {
  const { t } = useTranslation("procedure-type");
  const { count } = useProcedureTypeManager();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    logger.info("[ProcedureTypeManager] Page mounted");
  }, []);

  return (
    <ManagerLayout
      searchId="procedure-type-search"
      title={t("page.title")}
      count={count}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("page.searchPlaceholder")}
      table={<ProcedureTypeList searchTerm={searchTerm} />}
      sidePanelTitle={t("action.add")}
      sidePanelIcon={<Zap size={24} strokeWidth={2.5} />}
      sidePanelDescription={t("page.addDescription")}
      sidePanelContent={<AddProcedureTypePanel />}
    />
  );
}
