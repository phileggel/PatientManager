import { useMemo, useState } from "react";
import type { FundPaymentRow } from "../shared/types";

type SortKey = "fundName" | "paymentDate" | "totalAmount" | "procedureCount";

export interface SortConfig {
  key: SortKey | null;
  direction: "asc" | "desc" | null;
}

export function useSortFundPaymentList(groups: FundPaymentRow[], searchTerm: string) {
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

  const sortedAndFilteredGroups = useMemo(() => {
    let filtered = groups;

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = groups.filter(
        (group) => group.fundName.toLowerCase().includes(term) || group.paymentDate.includes(term),
      );
    }

    // Sort
    if (sortConfig.key && sortConfig.direction) {
      const key = sortConfig.key;
      filtered = [...filtered].sort((a, b) => {
        const valueA = a[key];
        const valueB = b[key];

        if (valueA === valueB) return 0;
        if (valueA === undefined || valueA === null) return 1;
        if (valueB === undefined || valueB === null) return -1;

        const comp = valueA > valueB ? 1 : -1;
        return sortConfig.direction === "asc" ? comp : -comp;
      });
    }

    return filtered;
  }, [groups, searchTerm, sortConfig]);

  return {
    sortedAndFilteredGroups,
    sortConfig,
    handleSort,
  };
}
