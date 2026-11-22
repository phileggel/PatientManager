import { useMemo, useState } from "react";
import type { FundPaymentRow } from "../shared/types";

type SortKey = "fundName" | "paymentDate" | "totalAmount" | "procedureCount";

/** A whole day typed as `YYYY-MM-DD` or `DD/MM/YYYY`, as `YYYY-MM-DD`; else null. */
function asIsoDay(term: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(term)) return term;
  const french = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(term);
  return french ? `${french[3]}-${french[2]}-${french[1]}` : null;
}

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

    // Filter by search term (FPM-540): fund name, payment date,
    // or any date inside the displayed care period range (FPM-360).
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const day = asIsoDay(term.trim());
      filtered = groups.filter(
        (group) =>
          group.fundName.toLowerCase().includes(term) ||
          group.paymentDate.includes(term) ||
          (group.procedureStartDate?.includes(term) ?? false) ||
          (group.procedureEndDate?.includes(term) ?? false) ||
          (day !== null &&
            group.procedureStartDate !== undefined &&
            group.procedureEndDate !== undefined &&
            group.procedureStartDate <= day &&
            day <= group.procedureEndDate),
      );
    }

    // Sort
    if (sortConfig.key && sortConfig.direction) {
      const key = sortConfig.key;
      filtered = filtered.toSorted((a, b) => {
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
