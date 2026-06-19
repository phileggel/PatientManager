import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ParsingIssues, SkippedRow } from "@/bindings";
import { logger } from "@/infra/logger";
import { Button, Dialog } from "@/ui/components";
import { SHEET_ORDER } from "../../shared/sheets";
import { formatSkipReason } from "../../shared/skipReasonPresenter";

interface ParsingReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsingIssues: ParsingIssues;
  skippedRowsCount: number;
  /**
   * EXI-290 — execute-time skipped procedures. Merged into the same flat
   * table as parse-time skips (EXI-220) — the pipeline origin is not
   * surfaced separately in the UI.
   */
  executeSkippedRows?: SkippedRow[];
}

function compareRows(a: SkippedRow, b: SkippedRow): number {
  const sheetDelta = (SHEET_ORDER[a.sheet] ?? 99) - (SHEET_ORDER[b.sheet] ?? 99);
  if (sheetDelta !== 0) return sheetDelta;
  return a.row_number - b.row_number;
}

export function ParsingReportModal({
  isOpen,
  onClose,
  parsingIssues,
  skippedRowsCount: _skippedRowsCount,
  executeSkippedRows,
}: ParsingReportModalProps) {
  const { t } = useTranslation("excel-import");

  useEffect(() => {
    logger.info("[ParsingReportModal] Component mounted");
  }, []);

  // Merge parse-time + execute-time into a single sorted list.
  // EXI-220 + EXI-290 — pipeline origin is internal, not user-visible.
  const skippedRows = useMemo(() => {
    const execute = executeSkippedRows ?? [];
    return [...parsingIssues.skipped_rows, ...execute].toSorted(compareRows);
  }, [parsingIssues.skipped_rows, executeSkippedRows]);

  const hasSkippedRows = skippedRows.length > 0;
  const hasMissingSheets = parsingIssues.missing_sheets.length > 0;
  const hasAnyIssue = hasSkippedRows || hasMissingSheets;

  return (
    <Dialog
      id="excel-parsing-report-modal"
      isOpen={isOpen}
      onClose={onClose}
      title={t("parsing_report.unified_title")}
      maxWidth="max-w-2xl"
      actions={
        <Button variant="primary" onClick={onClose}>
          {t("parsing_report.close")}
        </Button>
      }
    >
      <div className="space-y-6 pb-2">
        {/* Summary */}
        <div className="bg-m3-surface-container rounded-xl p-4">
          <h3 className="font-semibold text-m3-on-surface mb-2">{t("parsing_report.summary")}</h3>
          <div className="space-y-1 text-sm text-m3-on-surface-variant">
            <p>
              <span className="font-medium">{t("parsing_report.skipped_rows")}</span>{" "}
              {skippedRows.length}
            </p>
            <p>
              <span className="font-medium">{t("parsing_report.missing_sheets")}</span>{" "}
              {parsingIssues.missing_sheets.length}
            </p>
          </div>
        </div>

        {/* Missing Sheets */}
        {hasMissingSheets && (
          <div>
            <h3 className="font-semibold text-m3-on-surface mb-3">
              {t("parsing_report.missing_sheets_title")}
            </h3>
            <div className="bg-m3-surface-container rounded-xl p-4">
              <p className="text-sm text-m3-on-surface-variant mb-4">
                {t("parsing_report.missing_sheets_desc", {
                  count: parsingIssues.missing_sheets.length,
                })}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {parsingIssues.missing_sheets.map((sheet) => (
                  <div
                    key={sheet}
                    className="bg-m3-primary/10 rounded-xl px-3 py-2 text-m3-primary font-semibold text-sm"
                  >
                    {t(`sheet_selection.sheets.${sheet}`, { defaultValue: sheet })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Skipped Rows — single flat table, sheet column inline */}
        {hasSkippedRows && (
          <div>
            <h3 className="font-semibold text-m3-on-surface mb-3">
              {t("parsing_report.skipped_rows_title", { count: skippedRows.length })}
            </h3>
            <div className="overflow-x-auto rounded-xl bg-m3-surface-container">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-m3-surface-container-high">
                    <th className="px-4 py-3 text-left font-semibold text-m3-on-surface">
                      {t("parsing_report.col_sheet")}
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-m3-on-surface">
                      {t("parsing_report.col_row")}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-m3-on-surface">
                      {t("parsing_report.col_reason")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {skippedRows.map((skipped, idx) => (
                    <tr
                      key={`${skipped.sheet}-${skipped.row_number}-${idx}`}
                      className="hover:bg-m3-surface-variant/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-left font-medium text-m3-on-surface">
                        {skipped.sheet}
                      </td>
                      <td className="px-4 py-3 text-center text-m3-on-surface-variant">
                        {skipped.row_number}
                      </td>
                      <td className="px-4 py-3 text-left text-m3-on-surface-variant">
                        {(() => {
                          const { key, params } = formatSkipReason(skipped.reason);
                          return t(key, params);
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* No Issues */}
        {!hasAnyIssue && (
          <div className="bg-m3-tertiary-container/30 rounded-xl p-4">
            <p className="text-sm text-m3-on-tertiary-container font-medium">
              ✓ {t("parsing_report.no_issues")}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
