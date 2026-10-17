import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCacheStore } from "@/infra/cache/store";
import { useFormatters } from "@/ui/format/formatters";

export function useSelectPatientModal() {
  const patients = useCacheStore((state) => state.patients);
  const [searchTerm, setSearchTerm] = useState("");
  const { formatDate } = useFormatters();
  const { t } = useTranslation("bank");

  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const lower = searchTerm.toLowerCase();
    return patients.filter(
      (patient) =>
        (patient.name?.toLowerCase().includes(lower) ?? false) ||
        (patient.ssn?.toLowerCase().includes(lower) ?? false),
    );
  }, [patients, searchTerm]);

  const formatDateOrNA = useCallback(
    (dateStr: string | null) =>
      dateStr ? formatDate(dateStr) : t("transfer.select_patient_modal.na"),
    [formatDate, t],
  );

  return {
    patients,
    filteredPatients,
    searchTerm,
    setSearchTerm,
    formatDate: formatDateOrNA,
  };
}
