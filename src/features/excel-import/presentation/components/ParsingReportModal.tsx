import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ParsingIssues } from "@/bindings";
import { logger } from "@/lib/logger";

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-20 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-neutral-90">{t("parsingReport.title")}</h2>
          <button
            onClick={onClose}
            className="text-neutral-60 hover:text-neutral-90 font-semibold"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Summary */}
          <div className="bg-neutral-5 rounded-lg p-4 border border-neutral-20">
            <h3 className="font-semibold text-neutral-90 mb-2">{t("parsingReport.summary")}</h3>
            <div className="space-y-1 text-sm text-neutral-70">
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
              <h3 className="font-semibold text-neutral-90 mb-3">
                {t("parsingReport.missingSheetsTitle")}
              </h3>
              <div className="bg-neutral-10 border border-neutral-20 rounded-lg p-4">
                <p className="text-sm text-neutral-70 mb-4">
                  {t("parsingReport.missingSheetsDesc", {
                    count: parsingIssues.missing_sheets.length,
                  })}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {parsingIssues.missing_sheets.map((month) => (
                    <div
                      key={month}
                      className="bg-primary-10 rounded px-3 py-2 flex items-center gap-2 border border-primary-20"
                    >
                      <span className="text-primary-70 font-semibold text-sm w-8">{month}</span>
                      <span className="text-primary-60 text-xs">
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
              <h3 className="font-semibold text-neutral-90 mb-3">
                {t("parsingReport.skippedRowsTitle", { count: parsingIssues.skipped_rows.length })}
              </h3>

              {/* Tabs */}
              <div className="border-b border-neutral-20 mb-4">
                <div className="flex gap-1 overflow-x-auto">
                  {sheets.map((sheet) => (
                    <button
                      key={sheet}
                      onClick={() => setActiveTab(sheet)}
                      type="button"
                      className={`px-4 py-4 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${
                        activeTab === sheet
                          ? "border-primary-60 text-primary-60"
                          : "border-transparent text-neutral-60 hover:text-neutral-80"
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
                  <div key={sheet} className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-neutral-10">
                          <th className="px-4 py-3 text-center font-semibold text-neutral-80 border border-neutral-40">
                            {t("parsingReport.colRow")}
                          </th>
                          <th className="px-4 py-3 text-center font-semibold text-neutral-80 border border-neutral-40">
                            {t("parsingReport.colReason")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheetGroups.get(sheet)?.map((skipped) => (
                          <tr
                            key={`${skipped.sheet}-${skipped.row_number}`}
                            className="hover:bg-neutral-5 transition-colors"
                          >
                            <td className="px-4 py-3 text-center text-neutral-70 border border-neutral-40">
                              {skipped.row_number}
                            </td>
                            <td className="px-4 py-3 text-center text-neutral-70 border border-neutral-40">
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
            <div className="bg-success-10 border border-success-30 rounded-lg p-4">
              <p className="text-sm text-success-70 font-medium">✓ {t("parsingReport.noIssues")}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-neutral-5 border-t border-neutral-20 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary-60 text-white rounded font-medium hover:bg-primary-70 transition-colors"
            type="button"
          >
            {t("parsingReport.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
