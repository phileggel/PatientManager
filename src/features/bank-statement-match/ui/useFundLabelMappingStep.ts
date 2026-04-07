import { useEffect, useState } from "react";
import type { FundLabelResolution } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";

const TAG = "[FundLabelMappingStep]";

interface UseFundLabelMappingStepProps {
  resolutions: FundLabelResolution[];
  onConfirm: (mappings: Map<string, string>) => void;
}

export function useFundLabelMappingStep({ resolutions, onConfirm }: UseFundLabelMappingStepProps) {
  const funds = useAppStore((state) => state.funds);

  // F13: log on mount
  useEffect(() => {
    logger.info(TAG, "Mounted", { total: resolutions.length });
  }, [resolutions.length]);

  // Pre-seed confirmed labels only (R23: unknown labels start empty, R5: confirmed pre-filled).
  // Rejected confirmed labels are represented as "REJECTED" sentinel (ADR-001).
  const [selections, setSelections] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    for (const r of resolutions) {
      if (r.is_confirmed) {
        initial.set(r.bank_label, r.fund_id ?? "REJECTED");
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

  // R25: disabled until ALL resolutions have a selection
  const allMapped = resolutions.every((r) => selections.has(r.bank_label));

  const handleConfirm = () => {
    onConfirm(selections);
  };

  const fundOptions = funds.map((f) => ({
    value: f.id,
    label: `${f.fund_identifier} - ${f.name}`,
  }));

  // R27: unknown labels first (alpha), then confirmed/rejected (alpha)
  const unknownLabels = resolutions
    .filter((r) => !r.is_confirmed)
    .sort((a, b) => a.bank_label.localeCompare(b.bank_label));
  const confirmedLabels = resolutions
    .filter((r) => r.is_confirmed)
    .sort((a, b) => a.bank_label.localeCompare(b.bank_label));

  return {
    selections,
    handleSelectChange,
    allMapped,
    handleConfirm,
    fundOptions,
    unknownLabels,
    confirmedLabels,
  };
}
