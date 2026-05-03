import { ClipboardList, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/lib/formatters";
import { isPaidStatus, type ProcedureRow } from "../model/procedure-row.types";

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

  // Sum billed amounts using effectiveAmount so procedures with no explicit
  // override still contribute their procedure type's default_amount.
  const totalAmount = rows
    .filter((r) => !r.isDraft && r.effectiveAmount != null)
    .reduce((sum, r) => sum + (r.effectiveAmount || 0), 0);

  // Sum actual payment amounts (amounts received).
  // Falls back to effectiveAmount for paid-status procedures whose paid_amount is null
  // (backend bug: paid_amount = billed_amount = null when procedure uses default_amount).
  const totalReceived = rows
    .filter((r) => !r.isDraft)
    .reduce((sum, r) => {
      if (r.actualPaymentAmount != null) return sum + r.actualPaymentAmount;
      if (isPaidStatus(r.status) && r.effectiveAmount != null) return sum + r.effectiveAmount;
      return sum;
    }, 0);

  // Sum awaited amounts (outstanding balance = billed − received).
  // Uses the same paid-status fallback so reconciled procedures don't appear as still awaited.
  const totalAwaited = rows
    .filter((r) => !r.isDraft)
    .reduce((sum, r) => {
      const received = r.actualPaymentAmount ?? (isPaidStatus(r.status) ? r.effectiveAmount : null);
      const diff = (r.effectiveAmount || 0) - (received || 0);
      return sum + (diff > 0 ? diff : 0);
    }, 0);

  return (
    <div className="flex items-center gap-6 text-sm font-medium text-m3-on-surface">
      <div title={t("summary.patientsTooltip")} className="flex items-center gap-2 cursor-help">
        <Users className="w-4 h-4 text-m3-primary" />
        {uniquePatients}
      </div>

      <div className="w-px h-6 bg-m3-outline-variant" />

      <div title={t("summary.proceduresTooltip")} className="flex items-center gap-2 cursor-help">
        <ClipboardList className="w-4 h-4 text-m3-primary" />
        {procedureCount}
      </div>

      <div className="w-px h-6 bg-m3-outline-variant" />

      <div title={t("summary.effectueTooltip")} className="cursor-help flex items-center gap-2">
        <span className="text-m3-primary">{t("summary.effectue")}</span>
        {/* Amounts are in euros in ProcedureRow; formatCurrency expects thousandths */}
        <span>{formatCurrency(Math.round(totalAmount * 1000))}</span>
      </div>

      <div className="w-px h-6 bg-m3-outline-variant" />

      <div title={t("summary.recuTooltip")} className="cursor-help flex items-center gap-2">
        <span className="text-m3-primary">{t("summary.recu")}</span>
        <span>{formatCurrency(Math.round(totalReceived * 1000))}</span>
      </div>

      <div className="w-px h-6 bg-m3-outline-variant" />

      <div title={t("summary.enAttenteTooltip")} className="cursor-help flex items-center gap-2">
        <span className="text-m3-primary">{t("summary.enAttente")}</span>
        <span>{formatCurrency(Math.round(totalAwaited * 1000))}</span>
      </div>
    </div>
  );
}
