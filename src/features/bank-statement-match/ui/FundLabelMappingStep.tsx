// FundLabelMappingStep — shown for ALL labels (R7), confirmed pre-filled (R5/R23),
// unknown empty (R23), two-block display (R27), "Accepter" sticky top (R24/R25).
import { useTranslation } from "react-i18next";
import type { FundLabelResolution } from "@/bindings";
import { Button } from "@/ui/components/button";
import { CompactSelectField } from "@/ui/components/field/CompactSelectField";
import { useFundLabelMappingStep } from "./useFundLabelMappingStep";

interface FundLabelMappingStepProps {
  resolutions: FundLabelResolution[];
  onConfirm: (mappings: Map<string, string>) => void;
  isProcessing: boolean;
}

export function FundLabelMappingStep({
  resolutions,
  onConfirm,
  isProcessing,
}: FundLabelMappingStepProps) {
  const { t } = useTranslation("bank");
  const {
    selections,
    handleSelectChange,
    allMapped,
    handleConfirm,
    fundOptions,
    unknownLabels,
    confirmedLabels,
  } = useFundLabelMappingStep({ resolutions, onConfirm });

  const renderRow = (resolution: FundLabelResolution) => {
    const selected = selections.get(resolution.bank_label) ?? "";
    const isRejected = selected === "REJECTED";

    return (
      <div
        key={resolution.bank_label}
        className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
          isRejected
            ? "border-l-4 border-m3-error bg-m3-surface-container-low"
            : "border-m3-outline-variant bg-m3-surface-container-low"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`font-mono text-sm font-medium wrap-break-word ${
              isRejected ? "text-m3-on-surface-variant line-through" : "text-m3-on-surface"
            }`}
          >
            {resolution.bank_label}
          </p>
          {/* R28: suggestion shown as hint text only, never pre-selected */}
          {resolution.suggested_fund_name && !isRejected && !resolution.is_confirmed && (
            <p className="text-xs text-m3-on-surface-variant mt-1">
              {t("labelMapping.suggestion", { name: resolution.suggested_fund_name })}
            </p>
          )}
        </div>
        <div className="w-64">
          <CompactSelectField
            id={`fund-select-${resolution.bank_label}`}
            value={selected}
            onChange={(e) => handleSelectChange(resolution.bank_label, e.target.value)}
            className={`w-full ${isRejected ? "text-m3-error border-m3-error" : ""}`}
            aria-label={t("labelMapping.fundAriaLabel", { label: resolution.bank_label })}
          >
            <option value="">{t("labelMapping.selectPlaceholder")}</option>
            <option value="REJECTED" className="text-m3-error font-semibold">
              {t("labelMapping.rejected")}
            </option>
            <optgroup label={t("labelMapping.fundsGroup")}>
              {fundOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          </CompactSelectField>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* R24: "Accepter" button fixed at top, always visible */}
      <div className="sticky top-0 z-10 bg-m3-surface px-4 py-3 flex items-center justify-between gap-8">
        <div>
          <h3 className="text-base font-semibold text-m3-on-surface">{t("labelMapping.title")}</h3>
          <p className="text-sm text-m3-on-surface-variant">{t("labelMapping.description")}</p>
        </div>
        {/* R25: disabled until all labels have a selection */}
        <Button
          onClick={handleConfirm}
          variant="primary"
          disabled={!allMapped || isProcessing}
          loading={isProcessing}
        >
          {isProcessing ? t("labelMapping.saving") : t("labelMapping.accept")}
        </Button>
      </div>

      <div className="space-y-4">
        {/* Block 1: unknown labels (R27) */}
        {unknownLabels.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-m3-on-surface-variant">
              {t("labelMapping.sectionUnknown")}
            </p>
            {unknownLabels.map(renderRow)}
          </div>
        )}

        {/* Block 2: confirmed/rejected labels (R27) */}
        {confirmedLabels.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-m3-on-surface-variant">
              {t("labelMapping.sectionConfirmed")}
            </p>
            {confirmedLabels.map(renderRow)}
          </div>
        )}
      </div>

      {resolutions.length === 0 && (
        <p className="text-sm text-m3-on-surface-variant text-center py-8">
          {t("labelMapping.empty")}
        </p>
      )}
    </div>
  );
}
