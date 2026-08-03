import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankStatementCorrection, BankStatementReconciliation } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { Button } from "@/ui/components/button";
import { useFormatters } from "@/ui/format/formatters";
import { sortFundsByName } from "../shared/fundOptions";
import {
  allLabelsDecided,
  deriveLabelRows,
  type LabelRow,
  labelSlug,
  lastLinkFundCorrectionIndex,
} from "../shared/labelRows";

type LinkFundCorrection = Extract<BankStatementCorrection, { type: "LinkFund" }>;

interface LabelAssociationScreenProps {
  reconciliation: BankStatementReconciliation;
  corrections: BankStatementCorrection[];
  isBusy: boolean;
  /** Rejection message from the last correction attempt. */
  errorText?: string | null;
  onApplyCorrection: (correction: BankStatementCorrection) => Promise<boolean>;
  onRevertCorrection: (index: number) => Promise<void>;
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * BAS-120–121 — screen 1 of the two-screen flow: one row per distinct label
 * (first-occurrence order), inline fund select with suggestion helper
 * (BAS-120B), Ignorer/Rétablir single action (BAS-120C), destructive-change
 * confirmation when staged settlement items would drop (BAS-120E), and the
 * « Continuer » gate (BAS-121). Presentation per the validated wireframe.
 */
export function LabelAssociationScreen({
  reconciliation,
  corrections,
  isBusy,
  errorText,
  onApplyCorrection,
  onRevertCorrection,
  onContinue,
  onCancel,
}: LabelAssociationScreenProps) {
  const { t } = useTranslation("bank");
  const { formatCurrency } = useFormatters();
  const funds = useCacheStore((state) => state.funds);
  const rows = deriveLabelRows(reconciliation.lines);

  // BAS-120E — a link/ignore over staged settlement work waits here for its
  // inline confirmation instead of applying immediately.
  const [pendingCorrection, setPendingCorrection] = useState<LinkFundCorrection | null>(null);
  // BAS-120C — saved-rejected rows unlocked locally (nothing to revert).
  const [unlockedLabels, setUnlockedLabels] = useState<string[]>([]);

  const submitOrConfirm = (row: LabelRow, correction: LinkFundCorrection) => {
    if (row.hasAssignedItems) {
      setPendingCorrection(correction);
      return;
    }
    void onApplyCorrection(correction);
  };

  const handleRestore = (row: LabelRow) => {
    const index = lastLinkFundCorrectionIndex(corrections, row.label);
    if (index !== null) {
      void onRevertCorrection(index);
    } else {
      setUnlockedLabels((prev) => [...prev, row.label]);
    }
  };

  const decidedCount = rows.filter((row) => row.fundId !== null || row.isRejected).length;

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <h2 id="label-assoc-title" className="text-base font-semibold text-m3-on-surface">
        {t("bank:label_association.title")}
      </h2>

      <div id="label-assoc-scrollzone" className="flex flex-col gap-2 min-h-0 overflow-y-auto">
        {rows.map((row) => {
          const selectLocked = row.isRejected && !unlockedLabels.includes(row.label);
          const isPending = pendingCorrection?.bank_label === row.label;
          const chipKey = row.fundId
            ? "bank:label_association.chip.linked"
            : row.isRejected
              ? "bank:label_association.chip.ignored"
              : "bank:label_association.chip.todo";

          return (
            <div
              key={row.label}
              id={`label-assoc-row-${labelSlug(row.label)}`}
              className="grid grid-cols-[minmax(140px,180px)_max-content_1fr_max-content] items-center gap-3 rounded-xl border border-m3-outline/20 px-4 py-2.5"
            >
              <span className="italic text-m3-on-surface-variant truncate">{row.label}</span>
              <span className="text-xs text-m3-on-surface-variant whitespace-nowrap">
                {t("bank:label_association.line_count", { count: row.count })} ·{" "}
                {formatCurrency(row.totalAmount)}
              </span>

              <div className="flex flex-col gap-0.5 min-w-0">
                <select
                  id={`label-assoc-select-${labelSlug(row.label)}`}
                  className="w-full rounded-lg border border-m3-outline bg-m3-surface-container-high px-3 py-2 text-sm text-m3-on-surface disabled:opacity-50"
                  value={row.fundId ?? ""}
                  disabled={isBusy || selectLocked}
                  aria-label={t("bank:label_association.select_aria", { label: row.label })}
                  onChange={(e) =>
                    submitOrConfirm(row, {
                      type: "LinkFund",
                      bank_label: row.label,
                      assignment: { type: "Fund", fund_id: e.target.value },
                    })
                  }
                >
                  <option value="">{t("bank:label_association.select_placeholder")}</option>
                  {sortFundsByName(funds).map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name}
                    </option>
                  ))}
                </select>
                {!row.fundId && row.suggestedFundName && (
                  <span
                    id={`label-assoc-suggestion-${labelSlug(row.label)}`}
                    className="text-xs text-m3-on-surface-variant"
                  >
                    {t("bank:label_association.suggestion", { name: row.suggestedFundName })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end">
                {isPending ? (
                  // BAS-120E — inline confirmation replacing the row action.
                  <>
                    <span className="text-xs text-m3-error">
                      {t("bank:label_association.confirm_drop")}
                    </span>
                    <Button
                      id={`label-assoc-confirm-${labelSlug(row.label)}`}
                      variant="danger"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => {
                        void onApplyCorrection(pendingCorrection);
                        setPendingCorrection(null);
                      }}
                    >
                      {t("bank:label_association.confirm")}
                    </Button>
                    <Button
                      id={`label-assoc-confirm-cancel-${labelSlug(row.label)}`}
                      variant="secondary"
                      size="sm"
                      onClick={() => setPendingCorrection(null)}
                    >
                      {t("bank:label_association.confirm_cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <span
                      id={`label-assoc-chip-${labelSlug(row.label)}`}
                      className={`w-24 text-center text-xs font-semibold rounded-full px-2 py-1 ${
                        row.fundId
                          ? "bg-m3-success-container/60 text-m3-on-success-container"
                          : row.isRejected
                            ? "bg-m3-surface-variant text-m3-on-surface-variant"
                            : "bg-m3-tertiary-container/40 text-m3-tertiary"
                      }`}
                    >
                      {t(chipKey)}
                    </span>
                    <Button
                      id={`label-assoc-ignore-${labelSlug(row.label)}`}
                      variant={row.isRejected ? "outline" : "danger"}
                      size="sm"
                      className="w-24"
                      disabled={isBusy}
                      onClick={() =>
                        row.isRejected
                          ? handleRestore(row)
                          : submitOrConfirm(row, {
                              type: "LinkFund",
                              bank_label: row.label,
                              assignment: { type: "Rejected" },
                            })
                      }
                    >
                      {row.isRejected
                        ? t("bank:label_association.restore")
                        : t("bank:label_association.ignore")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {errorText && (
        <p id="label-assoc-error" role="alert" className="text-sm text-m3-error">
          {errorText}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-m3-outline/20 pt-4">
        <span className="text-xs text-m3-on-surface-variant">
          {t("bank:label_association.progress", { decided: decidedCount, total: rows.length })}
        </span>
        <div className="flex items-center gap-2">
          <Button id="label-assoc-cancel" variant="secondary" onClick={onCancel}>
            {t("bank:label_association.cancel")}
          </Button>
          <Button
            id="label-assoc-continue"
            variant="primary"
            disabled={isBusy || !allLabelsDecided(rows)}
            onClick={onContinue}
          >
            {t("bank:label_association.continue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
