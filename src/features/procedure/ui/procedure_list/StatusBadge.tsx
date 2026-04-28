import { useTranslation } from "react-i18next";

interface StatusBadgeProps {
  status: string | null | undefined;
}

function getBadgeColor(status: string | null | undefined): string {
  switch (status?.toUpperCase()) {
    case "CREATED":
      return "bg-m3-secondary-container text-m3-on-secondary-container";
    case "RECONCILED":
      return "bg-m3-tertiary-container text-m3-on-tertiary-container";
    case "DIRECTLY_PAID":
    case "FUND_PAID":
    case "IMPORT_DIRECTLY_PAID":
    case "IMPORT_FUND_PAID":
      return "bg-m3-primary-container text-m3-on-primary-container";
    case "OVERPAID":
    case "OVERPAYMENT_REFUND":
      return "bg-m3-error-container text-m3-on-error-container";
    default:
      return "bg-m3-surface-container-high text-m3-on-surface-variant";
  }
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation("procedure");
  const upper = status?.toUpperCase() ?? "";
  const isAnyPaid = [
    "DIRECTLY_PAID",
    "FUND_PAID",
    "IMPORT_DIRECTLY_PAID",
    "IMPORT_FUND_PAID",
  ].includes(upper);
  const key = isAnyPaid ? "paid" : (status?.toLowerCase() ?? "none");
  const label = t(`status.${key}`, { defaultValue: "—" });

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getBadgeColor(status)}`}
    >
      {label}
    </span>
  );
}
