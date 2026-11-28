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
    <div
      id="procedure-summary"
      className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm font-medium text-m3-on-surface"
    >
      <div
        id="procedure-summary-patients"
        title={t("summary.patients_tooltip")}
        className="flex items-center gap-2 cursor-help"
      >
        <Users className="w-4 h-4 text-m3-primary" />
        {vm.uniquePatients}
      </div>

      <div
        id="procedure-summary-procedures"
        title={t("summary.procedures_tooltip")}
        className="flex items-center gap-2 cursor-help"
      >
        <ClipboardList className="w-4 h-4 text-m3-primary" />
        {vm.procedureCount}
      </div>

      <div
        id="procedure-summary-billed"
        title={t("summary.effectue_tooltip")}
        className="cursor-help flex items-center gap-2"
      >
        <span className="text-m3-primary">{t("summary.effectue")}</span>
        <span>{formatCurrency(vm.totalAmountThousandths)}</span>
      </div>

      <div
        id="procedure-summary-received"
        title={t("summary.recu_tooltip")}
        className="cursor-help flex items-center gap-2"
      >
        <span className="text-m3-primary">{t("summary.recu")}</span>
        <span>{formatCurrency(vm.totalReceivedThousandths)}</span>
      </div>

      <div
        id="procedure-summary-awaited"
        title={t("summary.en_attente_tooltip")}
        className="cursor-help flex items-center gap-2"
      >
        <span className="text-m3-primary">{t("summary.en_attente")}</span>
        <span>{formatCurrency(vm.totalAwaitedThousandths)}</span>
      </div>
    </div>
  );
}
