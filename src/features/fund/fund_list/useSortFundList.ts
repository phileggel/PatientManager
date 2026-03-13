import { useMemo, useState } from "react";
import type { FundRow } from "../shared/types";

type SortKey = "fundIdentifier" | "fundName";

export interface SortConfig {
  key: SortKey | null;
  direction: "asc" | "desc" | null;
}

export function useSortFundList(funds: FundRow[], searchTerm: string) {
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

  const sortedAndFilteredFunds = useMemo(() => {
    let filtered = funds;

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = funds.filter(
        (fund) =>
          fund.fundIdentifier?.toLowerCase().includes(term) ||
          fund.fundName?.toLowerCase().includes(term),
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

        const comp = valueA > valueB ? 1 : -1;
        return sortConfig.direction === "asc" ? comp : -comp;
      });
    }

    return filtered;
  }, [funds, searchTerm, sortConfig]);

  return {
    sortedAndFilteredFunds,
    sortConfig,
    handleSort,
  };
}
