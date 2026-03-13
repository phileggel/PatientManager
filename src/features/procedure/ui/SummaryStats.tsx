import { ClipboardList, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/lib/formatters";
import type { ProcedureRow } from "../model/procedure-row.types";

interface SummaryStatsProps {
  rows: ProcedureRow[];
}

export function SummaryStats({ rows }: SummaryStatsProps) {
  const { t } = useTranslation("procedure");
  const { formatCurrency } = useFormatters();

  // Count unique patients
  const uniquePatients = new Set(
    rows.filter((r) => r.patientId && !r.isDraft).map((r) => r.patientId),
  ).size;

  // Count procedures (non-draft rows only)
  const procedureCount = rows.filter((r) => !r.isDraft).length;

  // Sum procedure amounts
  const totalAmount = rows
    .filter((r) => !r.isDraft && r.procedureAmount)
    .reduce((sum, r) => sum + (r.procedureAmount || 0), 0);

  // Sum actual payment amounts (amounts received)
  const totalReceived = rows
    .filter((r) => !r.isDraft && r.awaitedAmount !== null)
    .reduce((sum, r) => {
      const procedureAmount = r.procedureAmount || 0;
      const awaited = r.awaitedAmount || 0;
      return sum + (procedureAmount - awaited);
    }, 0);

  // Sum awaited amounts (outstanding balance)
  const totalAwaited = rows
    .filter((r) => !r.isDraft && r.awaitedAmount !== null && r.awaitedAmount > 0)
    .reduce((sum, r) => sum + (r.awaitedAmount || 0), 0);

  return (
    <div className="flex items-center gap-6 text-sm font-medium text-slate-700">
      <div title={t("summary.patientsTooltip")} className="flex items-center gap-2 cursor-help">
        <Users className="w-4 h-4 text-blue-700" />
        {uniquePatients}
      </div>

      <div className="w-px h-6 bg-slate-300" />

      <div title={t("summary.proceduresTooltip")} className="flex items-center gap-2 cursor-help">
        <ClipboardList className="w-4 h-4 text-blue-700" />
        {procedureCount}
      </div>

      <div className="w-px h-6 bg-slate-300" />

      <div title={t("summary.effectueTooltip")} className="cursor-help">
        <span className="text-blue-700">{t("summary.effectue")} </span>
        {/* Amounts are in euros in ProcedureRow; formatCurrency expects thousandths */}
        <span>{formatCurrency(Math.round(totalAmount * 1000))}</span>
      </div>

      <div className="w-px h-6 bg-slate-300" />

      <div title={t("summary.recuTooltip")} className="cursor-help">
        <span className="text-blue-700">{t("summary.recu")} </span>
        <span>{formatCurrency(Math.round(totalReceived * 1000))}</span>
      </div>

      <div className="w-px h-6 bg-slate-300" />

      <div title={t("summary.enAttenteTooltip")} className="cursor-help">
        <span className="text-blue-700">{t("summary.enAttente")} </span>
        <span>{formatCurrency(Math.round(totalAwaited * 1000))}</span>
      </div>
    </div>
  );
}
