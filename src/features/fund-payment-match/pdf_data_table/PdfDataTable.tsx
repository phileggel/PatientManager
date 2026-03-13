import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { NormalizedPdfLine, PdfParseResult, PdfProcedureGroup } from "@/bindings";
import { logger } from "@/lib/logger";
import { formatProcedureDateFromLine } from "../shared/utils";

interface PdfDataTableProps {
  data: PdfParseResult;
}

function formatAmount(amount: number): string {
  return `${(amount / 1000).toFixed(2).replace(".", ",")} \u20AC`;
}

function ProcedureLineRow({ line }: { line: NormalizedPdfLine }) {
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="px-4 py-2 text-slate-900">{line.patient_name}</td>
      <td className="px-4 py-2 text-slate-600 font-mono text-xs">{line.ssn}</td>
      <td className="px-4 py-2 text-slate-600">{line.nature}</td>
      <td className="px-4 py-2 text-slate-600">{formatProcedureDateFromLine(line)}</td>
      <td className="px-4 py-2 text-slate-900 text-right font-medium">
        {formatAmount(line.amount)}
      </td>
    </tr>
  );
}

function ProcedureGroupCard({ group }: { group: PdfProcedureGroup }) {
  const { t } = useTranslation("fund-payment-match");
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="bg-slate-100 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="font-semibold text-slate-900">{group.fund_label}</span>
          <span className="text-slate-500 text-sm ml-2">({group.fund_full_name})</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            {t("table.group.payment")} {group.payment_date}
          </span>
          <span
            className={`font-semibold ${group.is_total_valid ? "text-success-70" : "text-error-70"}`}
          >
            {formatAmount(group.total_amount)}
          </span>
          {!group.is_total_valid && (
            <span className="text-xs text-error-60 font-medium">
              {t("table.group.invalidTotal")}
            </span>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-slate-600">
            <th className="px-4 py-2 font-medium">{t("table.columns.patient")}</th>
            <th className="px-4 py-2 font-medium">{t("table.columns.ssn")}</th>
            <th className="px-4 py-2 font-medium">{t("table.columns.nature")}</th>
            <th className="px-4 py-2 font-medium">{t("table.columns.date")}</th>
            <th className="px-4 py-2 font-medium text-right">{t("table.columns.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {group.lines.map((line) => (
            <ProcedureLineRow key={line.invoice_number} line={line} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PdfDataTable({ data }: PdfDataTableProps) {
  const { t } = useTranslation("fund-payment-match");

  useEffect(() => {
    logger.info("[PdfDataTable] Component mounted");
  }, []);

  if (data.groups.length === 0) {
    return <div className="text-center py-8 text-slate-500">{t("table.empty")}</div>;
  }

  const actualTotal = data.groups.reduce(
    (sum, g) => sum + g.lines.reduce((lineSum, line) => lineSum + line.amount, 0),
    0,
  );
  const statedTotal = data.groups.reduce((sum, g) => sum + g.total_amount, 0);
  const totalLines = data.groups.reduce((sum, g) => sum + g.lines.length, 0);
  const hasDiscrepancy = actualTotal !== statedTotal;

  return (
    <div className="space-y-6">
      {/* Global summary */}
      <div className="rounded-lg border border-primary-20 bg-primary-10 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-700">
            {t("table.summary.groups", { count: data.groups.length })} •{" "}
            {t("table.summary.lines", { count: totalLines })}
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-600 mb-1">{t("table.summary.totalAmount")}</p>
            <p className="text-2xl font-bold text-primary-70">{formatAmount(actualTotal)}</p>
            {hasDiscrepancy && (
              <p className="text-xs text-error-60 mt-1">
                {t("table.summary.pdfStated")} {formatAmount(statedTotal)}
              </p>
            )}
          </div>
        </div>
      </div>

      {data.unparsed_line_count > 0 && (
        <div className="rounded-lg border border-warning-30 bg-warning-20 p-3 text-sm text-warning-90">
          <p className="font-semibold mb-2">
            {t("table.unparsed.warning", { count: data.unparsed_line_count })}
          </p>
          {data.unparsed_lines.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium">{t("table.unparsed.examples")}</p>
              {data.unparsed_lines.map((line) => (
                <pre
                  key={line}
                  className="text-xs font-mono bg-warning-10 p-2 rounded overflow-x-auto"
                >
                  {line}
                </pre>
              ))}
            </div>
          )}
        </div>
      )}

      {data.groups.map((group, groupIndex) => (
        <ProcedureGroupCard
          key={`${group.fund_label}-${group.payment_date}-${groupIndex}`}
          group={group}
        />
      ))}
    </div>
  );
}
