import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { FundLabelResolution } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { Button } from "@/ui/components/button";

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
  const funds = useAppStore((state) => state.funds);

  // Only show unconfirmed labels
  const unmapped = resolutions.filter((r) => !r.is_confirmed);

  // State for user selections: bankLabel → fundId
  const [selections, setSelections] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    for (const r of unmapped) {
      if (r.suggested_fund_id) {
        initial.set(r.bank_label, r.suggested_fund_id);
      }
    }
    return initial;
  });

  const handleSelectChange = (bankLabel: string, fundId: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      if (fundId) {
        next.set(bankLabel, fundId);
      } else {
        next.delete(bankLabel);
      }
      return next;
    });
  };

  const allMapped = unmapped.every((r) => selections.has(r.bank_label));

  const handleConfirm = () => {
    onConfirm(selections);
  };

  const fundOptions = funds.map((f) => ({
    value: f.id,
    label: `${f.fund_identifier} - ${f.name}`,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-neutral-90 mb-2">{t("labelMapping.title")}</h3>
        <p className="text-sm text-neutral-60">{t("labelMapping.description")}</p>
      </div>

      <div className="space-y-4">
        {unmapped.map((resolution) => {
          const isRejected = selections.get(resolution.bank_label) === "REJECTED";

          return (
            <div
              key={resolution.bank_label}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                isRejected ? "border-error-30 bg-error-10" : "border-neutral-20 bg-neutral-5"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p
                  className={`font-mono text-sm font-medium wrap-break-word ${
                    isRejected ? "text-error-70 line-through" : "text-neutral-90"
                  }`}
                >
                  {resolution.bank_label}
                </p>
                {resolution.suggested_fund_name && !isRejected && (
                  <p className="text-xs text-neutral-50 mt-1">
                    {t("labelMapping.suggestion", { name: resolution.suggested_fund_name })}
                  </p>
                )}
              </div>
              <div className="w-64">
                <select
                  value={selections.get(resolution.bank_label) || ""}
                  onChange={(e) => handleSelectChange(resolution.bank_label, e.target.value)}
                  className={`m3-input w-full appearance-none cursor-pointer text-sm ${
                    isRejected ? "border-error-30 text-error-70" : ""
                  }`}
                  aria-label={t("labelMapping.fundAriaLabel", { label: resolution.bank_label })}
                >
                  <option value="">{t("labelMapping.selectPlaceholder")}</option>
                  <option value="REJECTED" className="text-error-70 font-semibold">
                    {t("labelMapping.rejected")}
                  </option>
                  <optgroup label={t("labelMapping.fundsGroup")}>
                    {fundOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleConfirm} variant="primary" disabled={!allMapped || isProcessing}>
          {isProcessing ? t("labelMapping.saving") : t("labelMapping.confirm")}
        </Button>
      </div>
    </div>
  );
}
