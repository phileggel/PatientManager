import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/appStore";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("fr-FR");
  } catch {
    return "N/A";
  }
}

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

  return {
    patients,
    filteredPatients,
    searchTerm,
    setSearchTerm,
    formatDate,
  };
}
