import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CompactSelectField, IconButton } from "@/ui/components";
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
              {getMonthName(month)}
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

      <div className="flex items-center gap-1">
        <IconButton
          variant="ghost"
          shape="round"
          size="sm"
          aria-label={t("period.prevMonth")}
          icon={<ChevronLeft size={18} />}
          onClick={() => navigateMonth(-1)}
          disabled={!canGoPrev}
        />
        <IconButton
          variant="ghost"
          shape="round"
          size="sm"
          aria-label={t("period.nextMonth")}
          icon={<ChevronRight size={18} />}
          onClick={() => navigateMonth(1)}
          disabled={!canGoNext}
        />
      </div>
    </div>
  );
}
