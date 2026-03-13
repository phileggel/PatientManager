import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Patient } from "@/bindings";
import { logger } from "@/lib/logger";
import { SelectionModal } from "@/ui/components";
import { useSelectPatientModal } from "./useSelectPatientModal";

const TAG = "[SelectPatientModal]";

interface SelectPatientModalProps {
  isOpen: boolean;
  onSelect: (patient: Patient) => void;
  onCancel: () => void;
}

export function SelectPatientModal({ isOpen, onSelect, onCancel }: SelectPatientModalProps) {
  const { t } = useTranslation("bank");
  const { patients, filteredPatients, searchTerm, setSearchTerm, formatDate } =
    useSelectPatientModal();

  useEffect(() => {
    logger.info(TAG, "Component mounted");
  }, []);

  return (
    <SelectionModal
      isOpen={isOpen}
      onClose={onCancel}
      title={t("transfer.selectPatientModal.title")}
      maxWidth="max-w-3xl"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("transfer.selectPatientModal.searchPlaceholder")}
    >
      {filteredPatients.length === 0 ? (
        <p className="text-sm text-m3-on-surface-variant py-4 text-center">
          {patients.length === 0
            ? t("transfer.selectPatientModal.empty")
            : t("transfer.selectPatientModal.noMatch")}
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-m3-surface-container">
            <tr className="border-b border-m3-outline">
              <th className="px-4 py-2 text-left text-sm font-semibold text-m3-on-surface">
                {t("transfer.selectPatientModal.columns.name")}
              </th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-m3-on-surface">
                {t("transfer.selectPatientModal.columns.ssn")}
              </th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-m3-on-surface">
                {t("transfer.selectPatientModal.columns.latestDate")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.map((patient) => (
              <tr
                key={patient.id}
                onClick={() => onSelect(patient)}
                className="border-b border-m3-outline hover:bg-m3-surface-variant cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 text-sm text-m3-on-surface">
                  {patient.name || t("transfer.selectPatientModal.na")}
                </td>
                <td className="px-4 py-3 text-sm text-m3-on-surface-variant">
                  {patient.ssn || t("transfer.selectPatientModal.na")}
                </td>
                <td className="px-4 py-3 text-sm text-m3-on-surface-variant">
                  {formatDate(patient.latest_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SelectionModal>
  );
}
