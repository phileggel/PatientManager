import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "@/lib/appStore";
import { useFormatters } from "@/ui/format/formatters";

export function useSelectPatientModal() {
  const patients = useAppStore((state) => state.patients);
  const [searchTerm, setSearchTerm] = useState("");
  const { formatDate } = useFormatters();

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
    (dateStr: string | null) => (dateStr ? formatDate(dateStr) : "N/A"),
    [formatDate],
  );

  return {
    patients,
    filteredPatients,
    searchTerm,
    setSearchTerm,
    formatDate: formatDateOrNA,
  };
}
