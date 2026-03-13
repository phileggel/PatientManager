import { useMemo, useState } from "react";
import type { BankAccountRow } from "../shared/types";

type SortKey = "name" | "iban";

export interface SortConfig {
  key: SortKey | null;
  direction: "asc" | "desc" | null;
}

export function useSortBankAccountList(bankAccounts: BankAccountRow[], searchTerm: string) {
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

  const sortedAndFilteredAccounts = useMemo(() => {
    let filtered = bankAccounts;

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = bankAccounts.filter(
        (account) =>
          account.name.toLowerCase().includes(term) ||
          (account.iban?.toLowerCase().includes(term) ?? false),
      );
    }

    // Sort
    if (sortConfig.key && sortConfig.direction) {
      const key = sortConfig.key;
      filtered = [...filtered].sort((a, b) => {
        const valueA = a[key] || "";
        const valueB = b[key] || "";

        if (valueA === valueB) return 0;

        const comp = valueA > valueB ? 1 : -1;
        return sortConfig.direction === "asc" ? comp : -comp;
      });
    }

    return filtered;
  }, [bankAccounts, searchTerm, sortConfig]);

  return {
    sortedAndFilteredAccounts,
    sortConfig,
    handleSort,
  };
}
