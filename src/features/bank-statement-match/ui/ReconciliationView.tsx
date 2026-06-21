import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankStatementLine, BankStatementParseResult } from "@/bindings";
import { Button } from "@/ui/components/button";
import { presentCorrection, presentReconciliationError } from "../shared/reconciliationPresenter";
import { AssignGroupsModal } from "./AssignGroupsModal";
import { ErrorStep } from "./ErrorStep";
import { LinkFundModal } from "./LinkFundModal";
import { LoadingStep } from "./LoadingStep";
import { ReconciliationList } from "./ReconciliationList";
import { ReconciliationWizard } from "./ReconciliationWizard";
import { RemainderModal } from "./RemainderModal";
import { useBankStatementReconciliation } from "./useBankStatementReconciliation";

interface ReconciliationViewProps {
  bankAccountId: string;
  parseResult: BankStatementParseResult;
  onClose: () => void;
}

/**
 * BAS-060–069/090–094/100–103 — the live reconciliation flow: the document-order
 * list driven by `useBankStatementReconciliation`, the per-line correction modals
 * opened on double-click, the guided wizard, and the Validate action that commits
 * the draft and surfaces the created-entry summary.
 *
 * Lives in its own component so the reconciliation hook only mounts once the gate
 * has resolved both the parse result and the bank account (BAS-011–017).
 */
export function ReconciliationView({
  bankAccountId,
  parseResult,
  onClose,
}: ReconciliationViewProps) {
  const { t } = useTranslation("bank");
  const {
    reconciliation,
    corrections,
    isBusy,
    error,
    applyCorrection,
    revertCorrection,
    validate,
  } = useBankStatementReconciliation(bankAccountId, parseResult);

  const [activeLine, setActiveLine] = useState<BankStatementLine | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  // Done summary takes over once the validate commit succeeds (BAS-093).
  if (createdCount !== null) {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center py-12 space-y-4">
          <p className="text-lg font-medium text-m3-on-success-container">
            {t("statement.modal.done", { count: createdCount })}
          </p>
          <p className="text-m3-on-surface-variant">{t("statement.modal.done_description")}</p>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose} variant="secondary">
            {t("statement.modal.close")}
          </Button>
        </div>
      </div>
    );
  }

  if (reconciliation === null) {
    return <LoadingStep message={t("statement.modal.loading")} />;
  }

  const handleValidate = async () => {
    const count = await validate();
    if (count !== null) {
      setCreatedCount(count);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={setActiveLine}
        isBusy={isBusy}
        onOpenWizard={() => setIsWizardOpen(true)}
      />

      {/* BAS-065 — applied corrections, each revertable. */}
      {corrections.length > 0 && (
        <div id="applied-corrections">
          <h3 className="text-sm font-medium text-m3-on-surface-variant mb-2">
            {t("reconciliation.applied_corrections.title")}
          </h3>
          <ul className="flex flex-col gap-1">
            {corrections.map((correction, index) => {
              const { key, params } = presentCorrection(correction);
              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: corrections are an ordered append-only log; the index IS the stable identity (BAS-065 revert removes by index).
                  key={index}
                  className="flex items-center justify-between gap-3 text-sm text-m3-on-surface"
                >
                  <span>{t(key, params)}</span>
                  <Button
                    id={`correction-revert-${index}`}
                    variant="secondary"
                    aria-label={t("reconciliation.applied_corrections.revert_aria")}
                    disabled={isBusy}
                    onClick={() => void revertCorrection(index)}
                  >
                    {t("reconciliation.applied_corrections.revert")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <ErrorStep error={t(presentReconciliationError(error).key)} />}

      <div className="flex justify-end gap-3">
        <Button onClick={onClose} variant="secondary" disabled={isBusy}>
          {t("statement.modal.cancel")}
        </Button>
        <Button onClick={handleValidate} variant="primary" disabled={isBusy} loading={isBusy}>
          {t("statement.modal.validate")}
        </Button>
      </div>

      {/* Per-line correction modals — chosen by the line's current status (BAS-062). */}
      {activeLine?.status === "NeedsLink" && (
        <LinkFundModal
          line={activeLine}
          isOpen={true}
          onSubmit={(correction) => {
            void applyCorrection(correction);
            setActiveLine(null);
          }}
          onCancel={() => setActiveLine(null)}
        />
      )}

      {activeLine?.status === "Partial" && (
        <RemainderModal
          line={activeLine}
          isOpen={true}
          onSubmit={(correction) => {
            void applyCorrection(correction);
            setActiveLine(null);
          }}
          onCancel={() => setActiveLine(null)}
        />
      )}

      {activeLine !== null &&
        activeLine.status !== "NeedsLink" &&
        activeLine.status !== "Partial" && (
          <AssignGroupsModal
            line={activeLine}
            isOpen={true}
            onSubmit={(correction) => {
              void applyCorrection(correction);
              setActiveLine(null);
            }}
            onCancel={() => setActiveLine(null)}
          />
        )}

      {isWizardOpen && (
        <ReconciliationWizard
          reconciliation={reconciliation}
          isOpen={true}
          onApplyCorrection={(correction) => void applyCorrection(correction)}
          onComplete={() => setIsWizardOpen(false)}
          onAbandon={() => setIsWizardOpen(false)}
        />
      )}
    </div>
  );
}
