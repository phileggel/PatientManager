import { useTranslation } from "react-i18next";
import { CompactSelectField, SearchField } from "@/ui/components";
import type { ProcedureRow } from "../model/procedure-row.types";
import { PeriodSelector } from "./PeriodSelector";
import { SummaryStats } from "./SummaryStats";

interface ProcedurePageHeaderProps {
  selectedMonth: number;
  selectedYear: number;
  yearRange: { min: number; max: number };
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  rows: ProcedureRow[];
}

/**
 * The procedures page's header (PRO-010, PRO-060, PRO-100): the period, the
 * status filter and the search on a first line, the totals on a second; each
 * line wraps in a narrow window (#752).
 */
export function ProcedurePageHeader({
  selectedMonth,
  selectedYear,
  yearRange,
  onMonthChange,
  onYearChange,
  selectedStatus,
  onStatusChange,
  searchTerm,
  onSearchChange,
  rows,
}: ProcedurePageHeaderProps) {
  const { t } = useTranslation("procedure");

  return (
    <div
      id="procedure-page-header"
      className="bg-m3-surface-container-low p-4 shrink-0 flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <PeriodSelector
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          yearRange={yearRange}
          onMonthChange={onMonthChange}
          onYearChange={onYearChange}
        />
        <div className="flex grow basis-88 items-center gap-4">
          <CompactSelectField
            id="status-filter"
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            <option value="">{t("filter.all_statuses")}</option>
            <option value="NONE">{t("status.none")}</option>
            <option value="CREATED">{t("status.created")}</option>
            <option value="RECONCILED">{t("status.reconciled")}</option>
            <option value="PARTIALLY_RECONCILED">{t("status.partially_reconciled")}</option>
            <option value="DIRECTLY_PAID">{t("status.directly_paid")}</option>
            <option value="FUND_PAID">{t("status.fund_paid")}</option>
            <option value="PARTIALLY_FUND_PAID">{t("status.partially_fund_paid")}</option>
            <option value="IMPORT_DIRECTLY_PAID">{t("status.import_directly_paid")}</option>
            <option value="IMPORT_FUND_PAID">{t("status.import_fund_paid")}</option>
            <option value="OVERPAID">{t("status.overpaid")}</option>
            <option value="OVERPAYMENT_REFUND">{t("status.overpayment_refund")}</option>
          </CompactSelectField>
          <label htmlFor="procedure-search" className="sr-only">
            {t("filter.placeholder")}
          </label>
          <div className="flex-1 min-w-36 max-w-md">
            <SearchField
              id="procedure-search"
              value={searchTerm}
              onChange={onSearchChange}
              placeholder={t("filter.placeholder")}
            />
          </div>
        </div>
      </div>
      <SummaryStats rows={rows} />
    </div>
  );
}
