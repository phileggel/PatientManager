import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ParseExcelResponse } from "@/bindings";
import { Button } from "@/ui/components/button";

const FRENCH_MONTHS: Record<string, string> = {
  "01": "Janvier",
  "02": "Février",
  "03": "Mars",
  "04": "Avril",
  "05": "Mai",
  "06": "Juin",
  "07": "Juillet",
  "08": "Août",
  "09": "Septembre",
  "10": "Octobre",
  "11": "Novembre",
  "12": "Décembre",
};

function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const monthLabel = FRENCH_MONTHS[month ?? ""] ?? month;
  return `${monthLabel} ${year}`;
}

function extractMonths(parsedData: ParseExcelResponse): string[] {
  const months = new Set<string>();
  for (const proc of parsedData.procedures) {
    const m = proc.procedure_date.substring(0, 7);
    if (m.length === 7) months.add(m);
  }
  return Array.from(months).sort();
}

interface MonthSelectionStepProps {
  parsedData: ParseExcelResponse;
  onConfirm: (selectedMonths: string[]) => void;
  isLoading: boolean;
}

export function MonthSelectionStep({ parsedData, onConfirm, isLoading }: MonthSelectionStepProps) {
  const { t } = useTranslation("excel-import");
  const availableMonths = extractMonths(parsedData);
  const [selected, setSelected] = useState<Set<string>>(new Set(availableMonths));

  const toggleMonth = (month: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === availableMonths.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(availableMonths));
    }
  };

  const allSelected = selected.size === availableMonths.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-90">{t("monthSelection.title")}</h2>
        <p className="text-sm text-neutral-60 mt-1">{t("monthSelection.description")}</p>
      </div>

      <div className="border border-neutral-20 rounded-lg overflow-hidden">
        {/* Select all header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-neutral-5 border-b border-neutral-20">
          <input
            id="select-all"
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-4 h-4 accent-primary-60"
          />
          <label
            htmlFor="select-all"
            className="text-sm font-medium text-neutral-70 cursor-pointer"
          >
            {allSelected ? t("monthSelection.deselectAll") : t("monthSelection.selectAll")}
          </label>
          <span className="ml-auto text-xs text-neutral-50">
            {selected.size}/{availableMonths.length} {t("monthSelection.monthsSelected")}
          </span>
        </div>

        {/* Month list */}
        <ul className="divide-y divide-neutral-10">
          {availableMonths.map((month) => (
            <li key={month} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-5">
              <input
                id={`month-${month}`}
                type="checkbox"
                checked={selected.has(month)}
                onChange={() => toggleMonth(month)}
                className="w-4 h-4 accent-primary-60"
              />
              <label
                htmlFor={`month-${month}`}
                className="text-sm text-neutral-80 cursor-pointer flex-1"
              >
                {formatMonth(month)}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={isLoading || selected.size === 0}
        >
          {t("monthSelection.continue")}
        </Button>
      </div>
    </div>
  );
}
