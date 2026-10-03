import { useTranslation } from "react-i18next";
import type { PatientSummary } from "@/bindings";
import { useFormatters } from "@/ui/format/formatters";

/** PDU-012 — "14 actes · dernier le 12/09/2026", or that the patient has none. */
export function PatientActivity({ patient }: { patient: PatientSummary }) {
  const { t } = useTranslation("patient");
  const { formatDate } = useFormatters();
  if (patient.procedure_count === 0 || !patient.latest_procedure_date) {
    return <>{t("duplicates.no_procedure")}</>;
  }
  return (
    <>
      {t("duplicates.activity", {
        count: patient.procedure_count,
        date: formatDate(patient.latest_procedure_date),
      })}
    </>
  );
}
