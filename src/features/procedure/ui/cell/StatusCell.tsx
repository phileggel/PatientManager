import { useTranslation } from "react-i18next";
import { TABLE_STYLES } from "../ui.styles";

interface StatusCellProps {
  status: string | null | undefined;
}

function getStatusBadgeColor(status: string | null | undefined): string {
  switch (status?.toUpperCase()) {
    case "NONE":
      return "bg-slate-200 text-slate-700";
    case "CREATED":
      return "bg-blue-200 text-blue-700";
    case "RECONCILIATED":
      return "bg-yellow-200 text-yellow-700";
    case "DIRECTLY_PAYED":
    case "FUND_PAYED":
    case "IMPORT_DIRECTLY_PAYED":
    case "IMPORT_FUND_PAYED":
      return "bg-green-200 text-green-700";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

export function StatusCell({ status }: StatusCellProps) {
  const { t } = useTranslation("procedure");
  const upper = status?.toUpperCase() ?? "";
  const isAnyPayed = [
    "DIRECTLY_PAYED",
    "FUND_PAYED",
    "IMPORT_DIRECTLY_PAYED",
    "IMPORT_FUND_PAYED",
  ].includes(upper);
  const key = isAnyPayed ? "payed" : (status?.toLowerCase() ?? "none");
  const label = t(`status.${key}`, { defaultValue: "—" });

  return (
    <td className={`${TABLE_STYLES.cellBase} w-28`}>
      <span
        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(status)}`}
      >
        {label}
      </span>
    </td>
  );
}
