import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ParseExcelResponse } from "@/bindings";
import { Button } from "@/ui/components/button";
import { extractSheets } from "../../shared/sheets";

interface SheetSelectionStepProps {
  parsedData: ParseExcelResponse;
  onConfirm: (selectedSheets: string[]) => void;
  isLoading: boolean;
}

export function SheetSelectionStep({ parsedData, onConfirm, isLoading }: SheetSelectionStepProps) {
  const { t } = useTranslation("excel-import");
  const availableSheets = extractSheets(parsedData);
  const [selected, setSelected] = useState<Set<string>>(new Set(availableSheets));

  const toggleSheet = (sheet: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sheet)) {
        next.delete(sheet);
      } else {
        next.add(sheet);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === availableSheets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(availableSheets));
    }
  };

  const allSelected = selected.size === availableSheets.length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-90">{t("sheetSelection.title")}</h2>
        <p className="text-sm text-neutral-60 mt-1">{t("sheetSelection.description")}</p>
      </div>

      <div className="rounded-xl overflow-hidden bg-m3-surface-container-low">
        {/* Select all header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-m3-surface-container">
          <input
            id="sheet-selection-select-all"
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-4 h-4 accent-primary-60"
          />
          <label
            htmlFor="sheet-selection-select-all"
            className="text-sm font-medium text-neutral-70 cursor-pointer"
          >
            {allSelected ? t("sheetSelection.deselectAll") : t("sheetSelection.selectAll")}
          </label>
          <span className="ml-auto text-xs text-neutral-50">
            {selected.size}/{availableSheets.length} {t("sheetSelection.sheetsSelected")}
          </span>
        </div>

        {/* Sheet list */}
        <ul className="flex flex-col">
          {availableSheets.map((sheet) => (
            <li key={sheet} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-5">
              <input
                id={`sheet-selection-sheet-${sheet}`}
                type="checkbox"
                checked={selected.has(sheet)}
                onChange={() => toggleSheet(sheet)}
                className="w-4 h-4 accent-primary-60"
              />
              <label
                htmlFor={`sheet-selection-sheet-${sheet}`}
                className="text-sm text-neutral-80 cursor-pointer flex-1"
              >
                {t(`sheetSelection.sheets.${sheet}`)}
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex justify-end">
        <Button
          id="sheet-selection-continue"
          onClick={() => onConfirm(Array.from(selected))}
          disabled={isLoading || selected.size === 0}
        >
          {t("sheetSelection.continue")}
        </Button>
      </div>
    </div>
  );
}
