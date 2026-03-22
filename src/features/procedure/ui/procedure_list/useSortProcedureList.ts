import { useMemo, useState } from "react";
import type { ProcedureRow } from "../../model/procedure-row.types";

type SortKey = "patientName" | "procedureDate" | "procedureAmount" | "status";

export interface SortConfig {
  key: SortKey | null;
  direction: "asc" | "desc" | null;
}

export function useSortProcedureList(rows: ProcedureRow[]) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: null });

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === "asc") return { key, direction: "desc" };
        if (prev.direction === "desc") return { key: null, direction: null };
      }
      return { key, direction: "asc" };
    });
  };

  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return rows;
    const key = sortConfig.key;
    return [...rows].sort((a, b) => {
      if (key === "procedureAmount") {
        const numA = a[key] ?? -Infinity;
        const numB = b[key] ?? -Infinity;
        return sortConfig.direction === "asc" ? numA - numB : numB - numA;
      }
      const valA = (a[key] as string | null | undefined) ?? "";
      const valB = (b[key] as string | null | undefined) ?? "";
      if (!valA && !valB) return 0;
      if (!valA) return 1;
      if (!valB) return -1;
      const comp = valA.localeCompare(valB, undefined, { sensitivity: "base" });
      return sortConfig.direction === "asc" ? comp : -comp;
    });
  }, [rows, sortConfig]);

  return { sortedRows, sortConfig, handleSort };
}
