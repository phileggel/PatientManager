import { Edit, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/ui/components";
import { formatDateDisplay, type ProcedureRow } from "../../model";
import { COL_WIDTHS, TABLE_STYLES } from "../ui.styles";
import { StatusBadge } from "./StatusBadge";

interface ProcedureListProps {
  rows: ProcedureRow[];
  onEdit: (row: ProcedureRow) => void;
  onDelete: (id: string) => void;
}

export function ProcedureList({ rows, onEdit, onDelete }: ProcedureListProps) {
  const { t } = useTranslation("procedure");

  return (
    <div className={TABLE_STYLES.container}>
      <div className={TABLE_STYLES.tableWrapper}>
        <table className={TABLE_STYLES.table}>
          <thead className={TABLE_STYLES.thead}>
            <tr>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.patientName}`}>
                {t("table.patient")}
              </th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.ssn}`}>{t("table.ssn")}</th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.fundId}`}>{t("table.fundCode")}</th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.fundName}`}>{t("table.fundName")}</th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.procedureType}`}>
                {t("table.procedureType")}
              </th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.date}`}>{t("table.date")}</th>
              <th className={`${TABLE_STYLES.th} ${COL_WIDTHS.amount}`}>{t("table.amount")}</th>
              <th className={`${TABLE_STYLES.th} w-24`}>{t("table.paymentMethod")}</th>
              <th className={`${TABLE_STYLES.th} w-28`}>{t("table.confirmedDate")}</th>
              <th className={`${TABLE_STYLES.th} w-28`}>{t("table.status")}</th>
              <th className={TABLE_STYLES.th} />
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-8 text-center text-sm text-m3-on-surface-variant"
                >
                  {t("table.empty")}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.rowId} className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover}`}>
                  <td className={`${TABLE_STYLES.cellBase} ${COL_WIDTHS.patientName}`}>
                    {row.patientName ?? "—"}
                  </td>
                  <td className={`${TABLE_STYLES.cellBase} ${COL_WIDTHS.ssn}`}>{row.ssn ?? "—"}</td>
                  <td className={`${TABLE_STYLES.cellBase} ${COL_WIDTHS.fundId}`}>
                    {row.fundIdentifier ?? "—"}
                  </td>
                  <td className={`${TABLE_STYLES.cellBase} ${COL_WIDTHS.fundName}`}>
                    {row.fundName ?? "—"}
                  </td>
                  <td className={`${TABLE_STYLES.cellBase} ${COL_WIDTHS.procedureType}`}>
                    {row.procedureName ?? "—"}
                  </td>
                  <td className={`${TABLE_STYLES.cellBase} ${COL_WIDTHS.date}`}>
                    {row.procedureDate ? formatDateDisplay(row.procedureDate) : "—"}
                  </td>
                  <td className={`${TABLE_STYLES.cellBase} ${COL_WIDTHS.amount}`}>
                    {row.procedureAmount != null ? `€${row.procedureAmount.toFixed(2)}` : "—"}
                  </td>
                  <td className={`${TABLE_STYLES.cellBase} w-24`}>
                    {row.paymentMethod ? formatPaymentMethod(row.paymentMethod, t) : "—"}
                  </td>
                  <td className={`${TABLE_STYLES.cellBase} w-28`}>
                    {row.confirmedPaymentDate ? formatDateDisplay(row.confirmedPaymentDate) : "—"}
                  </td>
                  <td className={`${TABLE_STYLES.cellBase} w-28`}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    {row.id && (
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
                          onClick={() => onDelete(row.id as string)}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
