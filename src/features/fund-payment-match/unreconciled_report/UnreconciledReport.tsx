/**
 * UnreconciledReport - Post-validation report of unreconciled procedures
 *
 * Displayed after successful reconciliation validation.
 * Source: getUnreconciledProceduresInRange (Tauri command) via useReconciliationModal.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { UnreconciledProcedure } from "@/bindings";
import { useFormatters } from "@/lib/formatters";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components/button";

interface UnreconciledReportProps {
  procedures: UnreconciledProcedure[];
  startDate: string;
  endDate: string;
  onClose: () => void;
}

export function UnreconciledReportView({
  procedures,
  startDate,
  endDate,
  onClose,
}: UnreconciledReportProps) {
  const { t } = useTranslation("fund-payment-match");
  const { formatDate } = useFormatters();

  useEffect(() => {
    logger.info("[UnreconciledReport] Component mounted");
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-base font-semibold text-m3-on-surface">{t("report.title")}</h3>
        <p className="text-sm text-m3-on-surface-variant">
          {t("report.period", { start: formatDate(startDate), end: formatDate(endDate) })}
        </p>
      </div>

      {procedures.length === 0 ? (
        <p className="text-sm text-m3-tertiary font-medium">{t("report.empty")}</p>
      ) : (
        <>
          <p className="text-sm text-m3-error">{t("report.count", { count: procedures.length })}</p>
          <div className="m3-table-container overflow-auto max-h-80 print:max-h-none print:overflow-visible">
            <table className="w-full">
              <thead className="sticky top-0">
                <tr>
                  <th className="m3-th">{t("report.columns.date")}</th>
                  <th className="m3-th">{t("report.columns.patient")}</th>
                  <th className="m3-th">{t("report.columns.ssn")}</th>
                  <th className="m3-th text-right">{t("report.columns.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {procedures.map((proc) => (
                  <tr key={proc.procedure_id} className="m3-tr">
                    <td className="m3-td">{formatDate(proc.procedure_date)}</td>
                    <td className="m3-td">{proc.patient_name}</td>
                    <td className="m3-td font-mono text-xs">{proc.ssn}</td>
                    <td className="m3-td text-right">{(proc.amount / 1000).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex justify-end print:hidden">
        <Button onClick={onClose} variant="primary">
          {t("report.close")}
        </Button>
      </div>
    </div>
  );
}
