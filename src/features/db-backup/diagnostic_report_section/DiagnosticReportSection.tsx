import { CircleCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components";
import { useDiagnosticReport } from "./useDiagnosticReport";

interface DiagnosticReportSectionProps {
  /** The dialog is busy with an export or a restore. */
  disabled: boolean;
}

/**
 * DGR-010 to DGR-014 — the « Rapport de diagnostic » section of the database
 * backup dialog: one button, then the saved file's name and its support code.
 */
export function DiagnosticReportSection({ disabled }: DiagnosticReportSectionProps) {
  const { t } = useTranslation("db-backup");
  const { isGenerating, saved, generate } = useDiagnosticReport();

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-medium text-m3-on-surface">{t("diagnostic.title")}</h3>
        <p className="mt-1 text-sm text-m3-on-surface-variant leading-relaxed">
          {t("diagnostic.description")}
        </p>
      </div>
      {saved && (
        <output
          id="diagnostic-report-saved"
          className="flex items-start gap-3 rounded-xl bg-m3-surface-container-high p-4"
        >
          <CircleCheck size={20} className="mt-0.5 shrink-0 text-m3-primary" />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-m3-on-surface">
              {t("diagnostic.saved")} <span className="font-mono">{saved.fileName}</span>
            </span>
            <span className="text-m3-on-surface-variant">
              {t("diagnostic.send")}{" "}
              <span
                id="diagnostic-report-code"
                className="font-mono font-semibold text-m3-on-surface whitespace-nowrap"
              >
                {saved.supportCode}
              </span>
            </span>
          </div>
        </output>
      )}
      <div className="flex justify-end">
        <Button
          id="diagnostic-report-generate"
          variant="secondary"
          onClick={generate}
          loading={isGenerating}
          disabled={disabled || isGenerating}
        >
          {t("diagnostic.button")}
        </Button>
      </div>
    </div>
  );
}
