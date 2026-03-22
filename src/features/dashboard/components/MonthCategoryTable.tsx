import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/lib/formatters";
import type { YearlyData } from "../types";

interface MonthCategoryTableProps {
  title: string;
  data: YearlyData;
  categories: string[];
  annualDistinctPatients: number;
  annualProcedureCount: number;
}

export function MonthCategoryTable({
  title,
  data,
  categories,
  annualDistinctPatients,
  annualProcedureCount,
}: MonthCategoryTableProps) {
  const { t, i18n } = useTranslation("dashboard");
  const { formatCurrency } = useFormatters();

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        new Intl.DateTimeFormat(i18n.language, { month: "short" }).format(new Date(2024, i, 1)),
      ),
    [i18n.language],
  );

  // Calculate row totals and metric totals
  const rowTotals = months.map((_, idx) => {
    const month = idx + 1;
    const monthData = data[month];
    if (!monthData) return 0;
    return categories.reduce((sum, cat) => sum + (monthData.amounts[cat] || 0), 0);
  });

  // Calculate column totals
  const colTotals = categories.map((cat) => {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      total += data[month]?.amounts[cat] || 0;
    }
    return total;
  });

  const grandTotal = rowTotals.reduce((sum, val) => sum + val, 0);

  return (
    <div className="rounded-xl bg-m3-surface-container-lowest overflow-hidden shadow-elevation-1">
      <div className="px-3 py-2 bg-m3-surface-container-low">
        <h3 className="text-xs font-semibold text-m3-primary">{title}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-m3-surface-container-low">
            <tr>
              <th className="px-2 py-1 text-left text-xs font-medium text-m3-on-surface-variant">
                {t("table.month")}
              </th>
              <th className="px-2 py-1 text-right text-xs font-medium text-m3-on-surface-variant whitespace-nowrap">
                {t("table.patients")}
              </th>
              <th className="px-2 py-1 text-right text-xs font-medium text-m3-on-surface-variant whitespace-nowrap">
                {t("table.procedures")}
              </th>
              {categories.map((cat) => (
                <th
                  key={cat}
                  className="px-2 py-1 text-right text-xs font-medium text-m3-on-surface-variant whitespace-nowrap"
                >
                  {cat}
                </th>
              ))}
              <th className="px-2 py-1 text-right text-xs font-semibold text-m3-on-surface">
                {t("table.total")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-m3-outline-variant/10">
            {months.map((month, idx) => {
              const monthNum = idx + 1;
              const monthData = data[monthNum];

              return (
                <tr key={month} className="hover:bg-m3-surface-container">
                  <td className="px-2 py-1 font-medium text-m3-on-surface text-xs">{month}</td>
                  <td className="px-2 py-1 text-right text-m3-on-surface-variant whitespace-nowrap text-xs">
                    {monthData?.distinctPatients ?? 0}
                  </td>
                  <td className="px-2 py-1 text-right text-m3-on-surface-variant whitespace-nowrap text-xs">
                    {monthData?.procedureCount ?? 0}
                  </td>
                  {categories.map((cat) => {
                    const value = monthData?.amounts[cat] ?? 0;
                    return (
                      <td
                        key={cat}
                        className="px-2 py-1 text-right text-m3-on-surface-variant whitespace-nowrap text-xs"
                      >
                        {value > 0 ? formatCurrency(value) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right font-semibold text-m3-on-surface whitespace-nowrap text-xs">
                    {(rowTotals[idx] ?? 0) > 0 ? formatCurrency(rowTotals[idx] ?? 0) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-m3-surface-container-low">
            <tr>
              <td className="px-2 py-1 font-semibold text-m3-on-surface text-xs">
                {t("table.total")}
              </td>
              <td className="px-2 py-1 text-right font-semibold text-m3-on-surface whitespace-nowrap text-xs">
                {annualDistinctPatients}
              </td>
              <td className="px-2 py-1 text-right font-semibold text-m3-on-surface whitespace-nowrap text-xs">
                {annualProcedureCount}
              </td>
              {categories.map((cat, idx) => (
                <td
                  key={cat}
                  className="px-2 py-1 text-right font-semibold text-m3-on-surface whitespace-nowrap text-xs"
                >
                  {(colTotals[idx] ?? 0) > 0 ? formatCurrency(colTotals[idx] ?? 0) : "—"}
                </td>
              ))}
              <td className="px-2 py-1 text-right font-bold text-m3-primary whitespace-nowrap text-xs">
                {formatCurrency(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
