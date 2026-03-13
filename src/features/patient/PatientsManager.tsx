/**
 * PatientsManager - Patient Management Page
 *
 * ARCHITECTURE:
 * - usePatientManager: reads patient count from store for display
 * - PatientList: reads full patient data and renders table
 * - Event-driven updates via useAppInit (Tauri event listener)
 * - No manual refresh or polling needed
 */

import { UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { logger } from "@/lib/logger";
import { ManagerLayout } from "@/ui/components";
import { AddPatientPanel } from "./add_patient_panel/AddPatientPanel";
import { PatientList } from "./patient_list/PatientList";
import { usePatientManager } from "./usePatientManager";

export function PatientsManager() {
  const { t } = useTranslation("patient");
  const { count } = usePatientManager();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    logger.info("[PatientsManager] Page mounted");
  }, []);

  return (
    <ManagerLayout
      searchId="patient-search"
      title={t("page.title")}
      count={count}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("page.searchPlaceholder")}
      table={<PatientList searchTerm={searchTerm} />}
      sidePanelTitle={t("action.add")}
      sidePanelIcon={<UserPlus size={24} strokeWidth={2.5} />}
      sidePanelContent={<AddPatientPanel />}
    />
  );
}
