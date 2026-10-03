import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/infra/logger";
import { ManagerLayout } from "@/ui/components";
import { PatientDuplicateList } from "./patient_duplicate_list/PatientDuplicateList";
import { usePatientDuplicateList } from "./patient_duplicate_list/usePatientDuplicateList";

/**
 * PDU-016 — the « Doublons de patients » page: the candidate pairs on the left;
 * the side panel says what a duplicate is and what the two actions do.
 */
export function PatientDuplicateManager() {
  const { t } = useTranslation("patient");
  const list = usePatientDuplicateList();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    logger.info("[PatientDuplicateManager] Page mounted");
  }, []);

  return (
    <ManagerLayout
      searchId="patient-duplicate-search"
      title={t("duplicates.manager.title")}
      count={list.pairs.length}
      searchTerm={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("duplicates.manager.search_placeholder")}
      table={<PatientDuplicateList searchTerm={searchTerm} {...list} />}
      sidePanelTitle={t("duplicates.manager.panel_title")}
      sidePanelIcon={<Users size={24} strokeWidth={2.5} />}
      sidePanelDescription={t("duplicates.manager.panel_description")}
      sidePanelContent={
        <div className="flex flex-col gap-3 text-sm text-m3-on-surface-variant leading-relaxed">
          <p>{t("duplicates.manager.panel_body")}</p>
          <p>{t("duplicates.manager.panel_actions")}</p>
        </div>
      }
    />
  );
}
