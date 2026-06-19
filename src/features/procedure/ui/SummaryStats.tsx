import { ClipboardList, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/ui/format/formatters";
import type { ProcedureRow } from "../model/procedure-row.types";
import { summarizeProcedureRows } from "../shared/presenter";

interface SummaryStatsProps {
  rows: ProcedureRow[];
}

export function SummaryStats({ rows }: SummaryStatsProps) {
  const { t } = useTranslation("procedure");
  const { formatCurrency } = useFormatters();

  const vm = summarizeProcedureRows(rows);

  return (
    <div className="flex items-center gap-6 text-sm font-medium text-m3-on-surface">
      <div title={t("summary.patients_tooltip")} className="flex items-center gap-2 cursor-help">
        <Users className="w-4 h-4 text-m3-primary" />
        {vm.uniquePatients}
      </div>

      <div className="w-px h-6 bg-m3-outline-variant" />

      <div title={t("summary.procedures_tooltip")} className="flex items-center gap-2 cursor-help">
        <ClipboardList className="w-4 h-4 text-m3-primary" />
        {vm.procedureCount}
      </div>

      <div className="w-px h-6 bg-m3-outline-variant" />

      <div title={t("summary.effectue_tooltip")} className="cursor-help flex items-center gap-2">
        <span className="text-m3-primary">{t("summary.effectue")}</span>
        <span>{formatCurrency(vm.totalAmountThousandths)}</span>
      </div>

      <div className="w-px h-6 bg-m3-outline-variant" />

      <div title={t("summary.recu_tooltip")} className="cursor-help flex items-center gap-2">
        <span className="text-m3-primary">{t("summary.recu")}</span>
        <span>{formatCurrency(vm.totalReceivedThousandths)}</span>
      </div>

      <div className="w-px h-6 bg-m3-outline-variant" />

      <div title={t("summary.en_attente_tooltip")} className="cursor-help flex items-center gap-2">
        <span className="text-m3-primary">{t("summary.en_attente")}</span>
        <span>{formatCurrency(vm.totalAwaitedThousandths)}</span>
      </div>
    </div>
  );
}
