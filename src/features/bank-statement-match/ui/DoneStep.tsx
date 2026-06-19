import { useTranslation } from "react-i18next";

interface DoneStepProps {
  createdCount: number;
}

export function DoneStep({ createdCount }: DoneStepProps) {
  const { t } = useTranslation("bank");
  return (
    <div className="text-center py-12 space-y-4">
      <p className="text-lg font-medium text-m3-on-success-container">
        {t("statement.modal.done", { count: createdCount })}
      </p>
      <p className="text-m3-on-surface-variant">{t("statement.modal.done_description")}</p>
    </div>
  );
}
