import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/appStore";

export function useSelectPatientModal() {
  const patients = useAppStore((state) => state.patients);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const lower = searchTerm.toLowerCase();
    return patients.filter(
      (patient) =>
        (patient.name?.toLowerCase().includes(lower) ?? false) ||
        (patient.ssn?.toLowerCase().includes(lower) ?? false),
    );
  }, [patients, searchTerm]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("fr-FR");
    } catch {
      return "N/A";
    }
  };

  return {
    patients,
    filteredPatients,
    searchTerm,
    setSearchTerm,
    formatDate,
  };
}
