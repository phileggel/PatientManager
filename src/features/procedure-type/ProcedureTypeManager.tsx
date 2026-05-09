/**
 * ProcedureTypeManager - Procedure Type Management Page
 *
 * ARCHITECTURE:
 * - useProcedureTypeManager: reads filtered procedure type count from store for display
 * - ProcedureTypeList: reads full procedure type data and renders table
 * - CreateProcedureTypeModal: FAB-triggered modal for creating a new type
 * - Event-driven updates via useAppInit (Tauri event listener)
 * - No manual refresh or polling needed
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { FAB, ManagerHeader } from "@/ui/components";
import { CreateProcedureTypeModal } from "./create_procedure_type_modal/CreateProcedureTypeModal";
import { ProcedureTypeList } from "./procedure_type_list/ProcedureTypeList";
import { useProcedureTypeManager } from "./useProcedureTypeManager";

export function ProcedureTypeManager() {
  const { t } = useTranslation("procedure-type");
  const [searchTerm, setSearchTerm] = useState("");
  const { count } = useProcedureTypeManager(searchTerm);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    logger.info("[ProcedureTypeManager] Page mounted");
  }, []);

  return (
    <div className="flex flex-col h-full w-full relative">
      <ManagerHeader
        searchId="procedure-type-search"
        title={t("page.title")}
        count={count}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder={t("page.searchPlaceholder")}
      />
      <div className="flex-1 overflow-auto">
        <ProcedureTypeList searchTerm={searchTerm} />
      </div>

      <FAB
        id="fab-create-procedure-type"
        onClick={() => setIsCreateModalOpen(true)}
        label={t("action.fabAriaLabel")}
      />

      <CreateProcedureTypeModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
