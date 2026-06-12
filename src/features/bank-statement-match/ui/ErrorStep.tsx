import { useTranslation } from "react-i18next";

interface ErrorStepProps {
  error: string | null;
}

export function ErrorStep({ error }: ErrorStepProps) {
  const { t } = useTranslation("bank");
  return (
    <div className="text-center py-12 space-y-4">
      <p className="text-lg font-medium text-m3-error">{t("statement.modal.error")}</p>
      <p role="alert" className="text-m3-on-surface-variant">
        {error}
      </p>
    </div>
  );
}
