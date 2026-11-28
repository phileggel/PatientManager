import { useTranslation } from "react-i18next";
import { CompactSelectField } from "@/ui/components";
import { useFormatters } from "@/ui/format/formatters";
import { getMonthName } from "../model/date.logic";

interface PeriodSelectorProps {
  selectedMonth: number;
  selectedYear: number;
  yearRange: { min: number; max: number };
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
}

export function PeriodSelector({
  selectedMonth,
  selectedYear,
  yearRange,
  onMonthChange,
  onYearChange,
}: PeriodSelectorProps) {
  const { t } = useTranslation("procedure");
  const { locale } = useFormatters();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from(
    { length: yearRange.max - yearRange.min + 1 },
    (_, i) => yearRange.min + i,
  );

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <label
          htmlFor="month-selector"
          className="text-sm font-medium text-m3-primary whitespace-nowrap"
        >
          {t("period.month")}
        </label>
        <CompactSelectField
          id="month-selector"
          value={selectedMonth}
          onChange={(e) => onMonthChange(Number(e.target.value))}
        >
          {months.map((month) => (
            <option key={month} value={month} className="bg-m3-surface text-m3-on-surface">
              {getMonthName(month, locale)}
            </option>
          ))}
        </CompactSelectField>
      </div>

      <div className="flex items-center gap-2">
        <label
          htmlFor="year-selector"
          className="text-sm font-medium text-m3-primary whitespace-nowrap"
        >
          {t("period.year")}
        </label>
        <CompactSelectField
          id="year-selector"
          value={selectedYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
        >
          {years.map((year) => (
            <option key={year} value={year} className="bg-m3-surface text-m3-on-surface">
              {year}
            </option>
          ))}
        </CompactSelectField>
      </div>
    </div>
  );
}
