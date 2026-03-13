import { useMemo, useState } from "react";
import type { PatientRow } from "../shared/types";

type SortKey = "name" | "ssn" | "latestFund" | "latestDate";

export interface SortConfig {
  key: SortKey | null;
  direction: "asc" | "desc" | null;
}

export function useSortPatientList(patients: PatientRow[], searchTerm: string) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: null,
  });

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === "asc") {
          return { key, direction: "desc" };
        }
        if (prev.direction === "desc") {
          return { key: null, direction: null };
        }
      }
      return { key, direction: "asc" };
    });
  };

  const sortedAndFilteredPatients = useMemo(() => {
    let filtered = patients;

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = patients.filter(
        (patient) =>
          patient.name?.toLowerCase().includes(term) || patient.ssn?.toLowerCase().includes(term),
      );
    }

    // Sort
    if (sortConfig.key && sortConfig.direction) {
      const key = sortConfig.key;
      filtered = [...filtered].sort((a, b) => {
        const valueA = a[key];
        const valueB = b[key];

        if (valueA === valueB) return 0;
        if (!valueA) return 1;
        if (!valueB) return -1;

        const comp = valueA.localeCompare(valueB, undefined, { sensitivity: "base" });
        return sortConfig.direction === "asc" ? comp : -comp;
      });
    }

    return filtered;
  }, [patients, searchTerm, sortConfig]);

  return {
    sortedAndFilteredPatients,
    sortConfig,
    handleSort,
  };
}
