import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ParsingIssues } from "@/bindings";
import { logger } from "@/lib/logger";
import { Button, Dialog } from "@/ui/components";

interface ParsingReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsingIssues: ParsingIssues;
  skippedRowsCount: number;
}

export function ParsingReportModal({
  isOpen,
  onClose,
  parsingIssues,
  skippedRowsCount,
}: ParsingReportModalProps) {
  const { t } = useTranslation("excel-import");

  useEffect(() => {
    logger.info("[ParsingReportModal] Component mounted");
  }, []);

  // Group skipped rows by sheet (excluding rows with #N/A patient names)
  const sheetGroups = useMemo(() => {
    const groups = new Map<string, typeof parsingIssues.skipped_rows>();

    // Month order for proper sorting
    const monthOrder: Record<string, number> = {
      Jan: 0,
      Fév: 1,
      Mars: 2,
      Avr: 3,
      Mai: 4,
      Juin: 5,
      Juil: 6,
      Août: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Déc: 11,
    };

    for (const row of parsingIssues.skipped_rows) {
      // Skip rows where patient name was #N/A or empty rows
      if (row.reason.includes("patient name is #N/A") || row.reason.includes("empty row")) {
        continue;
      }

      if (!groups.has(row.sheet)) {
        groups.set(row.sheet, []);
      }
      groups.get(row.sheet)?.push(row);
    }

    // Sort by month order
    const sortedEntries = [...groups.entries()].sort((a, b) => {
      const orderA = monthOrder[a[0]] ?? 999;
      const orderB = monthOrder[b[0]] ?? 999;
      return orderA - orderB;
    });

    return new Map(sortedEntries);
  }, [parsingIssues.skipped_rows]);

  const sheets = Array.from(sheetGroups.keys());
  const [activeTab, setActiveTab] = useState<string>(sheets[0] || "");

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={t("parsingReport.title")}
      maxWidth="max-w-2xl"
      actions={
        <Button variant="primary" onClick={onClose}>
          {t("parsingReport.close")}
        </Button>
      }
    >
      <div className="space-y-6 pb-2">
        {/* Summary */}
        <div className="bg-m3-surface-container rounded-xl p-4">
          <h3 className="font-semibold text-m3-on-surface mb-2">{t("parsingReport.summary")}</h3>
          <div className="space-y-1 text-sm text-m3-on-surface-variant">
            <p>
              <span className="font-medium">{t("parsingReport.skippedRows")}</span>{" "}
              {skippedRowsCount}
            </p>
            <p>
              <span className="font-medium">{t("parsingReport.missingSheets")}</span>{" "}
              {parsingIssues.missing_sheets.length}
            </p>
          </div>
        </div>

        {/* Missing Sheets */}
        {parsingIssues.missing_sheets.length > 0 && (
          <div>
            <h3 className="font-semibold text-m3-on-surface mb-3">
              {t("parsingReport.missingSheetsTitle")}
            </h3>
            <div className="bg-m3-surface-container rounded-xl p-4">
              <p className="text-sm text-m3-on-surface-variant mb-4">
                {t("parsingReport.missingSheetsDesc", {
                  count: parsingIssues.missing_sheets.length,
                })}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {parsingIssues.missing_sheets.map((month) => (
                  <div
                    key={month}
                    className="bg-m3-primary/10 rounded-xl px-3 py-2 flex items-center gap-2"
                  >
                    <span className="text-m3-primary font-semibold text-sm w-8">{month}</span>
                    <span className="text-m3-on-surface-variant text-xs">
                      {t(`parsingReport.months.${month}`, { defaultValue: month })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Skipped Rows with Tabs */}
        {parsingIssues.skipped_rows.length > 0 && (
          <div>
            <h3 className="font-semibold text-m3-on-surface mb-3">
              {t("parsingReport.skippedRowsTitle", { count: parsingIssues.skipped_rows.length })}
            </h3>

            {/* Tabs */}
            <div className="mb-4">
              <div className="flex gap-1 overflow-x-auto">
                {sheets.map((sheet) => (
                  <button
                    key={sheet}
                    onClick={() => setActiveTab(sheet)}
                    type="button"
                    className={`px-4 py-2 font-medium text-sm whitespace-nowrap rounded-xl transition-colors ${
                      activeTab === sheet
                        ? "bg-m3-primary/10 text-m3-primary"
                        : "text-m3-on-surface-variant hover:bg-m3-surface-variant/30"
                    }`}
                  >
                    {sheet} ({sheetGroups.get(sheet)?.length || 0})
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            {sheets.map((sheet) => {
              if (activeTab !== sheet) return null;
              return (
                <div key={sheet} className="overflow-x-auto rounded-xl bg-m3-surface-container">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-m3-surface-container-high">
                        <th className="px-4 py-3 text-center font-semibold text-m3-on-surface">
                          {t("parsingReport.colRow")}
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-m3-on-surface">
                          {t("parsingReport.colReason")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheetGroups.get(sheet)?.map((skipped) => (
                        <tr
                          key={`${skipped.sheet}-${skipped.row_number}`}
                          className="hover:bg-m3-surface-variant/20 transition-colors"
                        >
                          <td className="px-4 py-3 text-center text-m3-on-surface-variant">
                            {skipped.row_number}
                          </td>
                          <td className="px-4 py-3 text-center text-m3-on-surface-variant">
                            {skipped.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}

        {/* No Issues */}
        {parsingIssues.skipped_rows.length === 0 && parsingIssues.missing_sheets.length === 0 && (
          <div className="bg-m3-tertiary-container/30 rounded-xl p-4">
            <p className="text-sm text-m3-on-tertiary-container font-medium">
              ✓ {t("parsingReport.noIssues")}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
