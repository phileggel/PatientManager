import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from(
    { length: yearRange.max - yearRange.min + 1 },
    (_, i) => yearRange.min + i,
  );

  function navigateMonth(direction: -1 | 1) {
    let newMonth = selectedMonth + direction;
    let newYear = selectedYear;
    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    } else if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    if (newYear < yearRange.min || newYear > yearRange.max) return;
    onMonthChange(newMonth);
    onYearChange(newYear);
  }

  const canGoPrev = !(selectedMonth === 1 && selectedYear <= yearRange.min);
  const canGoNext = !(selectedMonth === 12 && selectedYear >= yearRange.max);

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="month-selector" className="text-sm font-medium text-blue-700">
          {t("period.month")}
        </label>
        <select
          id="month-selector"
          value={selectedMonth}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-60 focus:outline-none focus:ring-1 focus:ring-primary-60"
        >
          {months.map((month) => (
            <option key={month} value={month}>
              {getMonthName(month)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="year-selector" className="text-sm font-medium text-blue-700">
          {t("period.year")}
        </label>
        <select
          id="year-selector"
          value={selectedYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary-60 focus:outline-none focus:ring-1 focus:ring-primary-60"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigateMonth(-1)}
          disabled={!canGoPrev}
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Mois précédent"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => navigateMonth(1)}
          disabled={!canGoNext}
          className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Mois suivant"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
