import { useMemo } from "react";
import type { ProcedureRow } from "../model/procedure-row.types";

export function useProcedurePeriod(
  procedures: ProcedureRow[],
  selectedMonth: number,
  selectedYear: number,
) {
  // Calculate year range based on procedures
  const yearRange = useMemo(() => {
    const currentYear = new Date().getFullYear();

    const validYears = procedures
      .map((row) => row.procedureDate)
      .filter((date): date is string => date !== null && date.length > 0)
      .map((date) => {
        const year = new Date(date).getFullYear();
        // Only include valid years (not NaN)
        return Number.isNaN(year) ? null : year;
      })
      .filter((year): year is number => year !== null);

    // If no procedures have valid dates, use current year range
    if (validYears.length === 0) {
      return { min: currentYear - 1, max: currentYear };
    }

    const minYear = Math.min(...validYears);
    return { min: minYear - 1, max: currentYear };
  }, [procedures]);

  // Filter rows by selected month/year
  const filteredRows = useMemo(() => {
    const periodKey = `${selectedYear}-${selectedMonth.toString().padStart(2, "0")}`;

    return procedures.filter((row) => {
      // For drafts, filter by draftPeriod (separate from actual procedureDate)
      if (row.isDraft && row.draftPeriod) {
        return row.draftPeriod === periodKey;
      }

      // For saved procedures, filter by procedureDate
      if (!row.procedureDate) return false;
      const date = new Date(row.procedureDate);
      return date.getMonth() + 1 === selectedMonth && date.getFullYear() === selectedYear;
    });
  }, [procedures, selectedMonth, selectedYear]);

  return { yearRange, filteredRows };
}
