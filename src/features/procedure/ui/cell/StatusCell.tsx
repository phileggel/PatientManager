import { useTranslation } from "react-i18next";
import { TABLE_STYLES } from "../ui.styles";

interface StatusCellProps {
  status: string | null | undefined;
}

function getStatusBadgeColor(status: string | null | undefined): string {
  switch (status?.toUpperCase()) {
    case "NONE":
      return "bg-m3-surface-container-high text-m3-on-surface-variant";
    case "CREATED":
      return "bg-m3-secondary-container text-m3-on-secondary-container";
    case "RECONCILIATED":
      return "bg-m3-tertiary-container text-m3-on-tertiary-container";
    case "DIRECTLY_PAYED":
    case "FUND_PAYED":
    case "IMPORT_DIRECTLY_PAYED":
    case "IMPORT_FUND_PAYED":
      return "bg-m3-primary-container text-m3-on-primary-container";
    default:
      return "bg-m3-surface-container-high text-m3-on-surface-variant";
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
