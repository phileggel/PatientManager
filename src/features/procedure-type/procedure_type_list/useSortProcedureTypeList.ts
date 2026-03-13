import { useMemo, useState } from "react";
import type { ProcedureTypeRow } from "../shared/types";

type SortKey = "name" | "defaultAmount" | null;
type SortDirection = "asc" | "desc" | null;

export interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export function useSortProcedureTypeList(
  procedureTypeRows: ProcedureTypeRow[],
  searchTerm: string,
) {
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

  const sortedAndFilteredProcedureTypes = useMemo(() => {
    let filtered = procedureTypeRows;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (pt) =>
          pt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pt.category?.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Sort
    if (!sortConfig.key || !sortConfig.direction) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof ProcedureTypeRow];
      const bVal = b[sortConfig.key as keyof ProcedureTypeRow];

      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      const comp = aVal > bVal ? 1 : -1;
      return sortConfig.direction === "asc" ? comp : -comp;
    });
  }, [procedureTypeRows, searchTerm, sortConfig]);

  return {
    sortedAndFilteredProcedureTypes,
    sortConfig,
    handleSort,
  };
}
