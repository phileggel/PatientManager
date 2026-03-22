import { Edit, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/lib/formatters";
import { IconButton, SortIcon } from "@/ui/components";
import { formatDateDisplay, type ProcedureRow } from "../../model";
import { COL_WIDTHS } from "../ui.styles";
import { StatusBadge } from "./StatusBadge";
import { useSortProcedureList } from "./useSortProcedureList";

interface ProcedureListProps {
  rows: ProcedureRow[];
  isFiltered?: boolean;
  onEdit: (row: ProcedureRow) => void;
  onDelete: (id: string) => void;
}

export function ProcedureList({ rows, isFiltered, onEdit, onDelete }: ProcedureListProps) {
  const { t } = useTranslation("procedure");
  const { t: tc } = useTranslation("common");
  const { formatCurrency } = useFormatters();
  const { sortedRows, sortConfig, handleSort } = useSortProcedureList(rows);

  return (
    <div className="m3-table-container">
      <table className="w-full border-collapse min-w-[1100px]">
        <thead>
          <tr>
            <th
              className={`m3-th ${COL_WIDTHS.patientName}`}
              onClick={() => handleSort("patientName")}
            >
              <div className="flex items-center gap-1">
                {t("table.patient")}
                <SortIcon
                  active={sortConfig.key === "patientName"}
                  direction={sortConfig.direction}
                />
              </div>
            </th>
            <th className={`m3-th ${COL_WIDTHS.ssn}`}>{t("table.ssn")}</th>
            <th className={`m3-th ${COL_WIDTHS.fundId}`}>{t("table.fundCode")}</th>
            <th className={`m3-th ${COL_WIDTHS.fundName}`}>{t("table.fundName")}</th>
            <th className={`m3-th ${COL_WIDTHS.procedureType}`}>{t("table.procedureType")}</th>
            <th className={`m3-th ${COL_WIDTHS.date}`} onClick={() => handleSort("procedureDate")}>
              <div className="flex items-center gap-1">
                {t("table.date")}
                <SortIcon
                  active={sortConfig.key === "procedureDate"}
                  direction={sortConfig.direction}
                />
              </div>
            </th>
            <th
              className={`m3-th ${COL_WIDTHS.amount}`}
              onClick={() => handleSort("procedureAmount")}
            >
              <div className="flex items-center gap-1">
                {t("table.amount")}
                <SortIcon
                  active={sortConfig.key === "procedureAmount"}
                  direction={sortConfig.direction}
                />
              </div>
            </th>
            <th className="m3-th w-24">{t("table.paymentMethod")}</th>
            <th className="m3-th w-28">{t("table.confirmedDate")}</th>
            <th className="m3-th w-28" onClick={() => handleSort("status")}>
              <div className="flex items-center gap-1">
                {t("table.status")}
                <SortIcon active={sortConfig.key === "status"} direction={sortConfig.direction} />
              </div>
            </th>
            <th className="m3-th">{tc("table.actions")}</th>
          </tr>
        </thead>

        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={11} className="m3-td text-center py-8">
                {isFiltered ? t("filter.emptySearch") : t("table.empty")}
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr key={row.rowId} className="m3-tr">
                <td className={`m3-td ${COL_WIDTHS.patientName}`}>{row.patientName ?? "—"}</td>
                <td className={`m3-td ${COL_WIDTHS.ssn}`}>{row.ssn ?? "—"}</td>
                <td className={`m3-td ${COL_WIDTHS.fundId}`}>{row.fundIdentifier ?? "—"}</td>
                <td className={`m3-td ${COL_WIDTHS.fundName}`}>{row.fundName ?? "—"}</td>
                <td className={`m3-td ${COL_WIDTHS.procedureType}`}>{row.procedureName ?? "—"}</td>
                <td className={`m3-td ${COL_WIDTHS.date}`}>
                  {row.procedureDate ? formatDateDisplay(row.procedureDate) : "—"}
                </td>
                <td className={`m3-td ${COL_WIDTHS.amount}`}>
                  {row.procedureAmount != null
                    ? formatCurrency(Math.round(row.procedureAmount * 1000))
                    : "—"}
                </td>
                <td className="m3-td w-24">
                  {row.paymentMethod ? formatPaymentMethod(row.paymentMethod, t) : "—"}
                </td>
                <td className="m3-td w-28">
                  {row.confirmedPaymentDate ? formatDateDisplay(row.confirmedPaymentDate) : "—"}
                </td>
                <td className="m3-td w-28">
                  <StatusBadge status={row.status} />
                </td>
                <td className="m3-td text-right">
                  <div className="flex gap-1 justify-end">
                    <IconButton
                      variant="ghost"
                      size="sm"
                      shape="round"
                      aria-label={t("action.editTitle")}
                      icon={<Edit size={16} />}
                      onClick={() => onEdit(row)}
                    />
                    <IconButton
                      variant="danger"
                      size="sm"
                      shape="round"
                      aria-label={t("action.deleteTitle")}
                      icon={<Trash2 size={16} />}
                      disabled={!row.id}
                      onClick={() => row.id && onDelete(row.id)}
                    />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatPaymentMethod(method: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    NONE: t("form.payment.none"),
    CASH: t("form.payment.cash"),
    CHECK: t("form.payment.check"),
    BANK_CARD: t("form.payment.card"),
    BANK_TRANSFER: t("form.payment.transfer"),
  };
  return map[method] ?? method;
}
