import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankStatementCorrection,
  BankStatementLine,
  BankStatementParseResult,
} from "@/bindings";
import { getProcedureWindowDays } from "@/infra/settings/store";
import { Button } from "@/ui/components/button";
import { presentCorrection, presentReconciliationError } from "../shared/reconciliationPresenter";
import { AssignGroupsModal } from "./AssignGroupsModal";
import { ErrorStep } from "./ErrorStep";
import { LabelAssociationScreen } from "./LabelAssociationScreen";
import { LoadingStep } from "./LoadingStep";
import { ReconciliationList } from "./ReconciliationList";
import { ReconciliationWizard } from "./ReconciliationWizard";
import { useBankStatementReconciliation } from "./useBankStatementReconciliation";

interface ReconciliationViewProps {
  bankAccountId: string;
  parseResult: BankStatementParseResult;
  onClose: () => void;
}

/**
 * BAS-120–123 — the two-screen reconciliation flow over one shared draft:
 * screen 1 associates every bank label to a fund (or ignores it, BAS-120–121),
 * screen 2 settles the linked labels' lines (list + dialogs + settlement-only
 * wizard, BAS-122) and validates once every line is decided (BAS-123).
 *
 * Lives in its own component so the reconciliation hook only mounts once the
 * gate has resolved both the parse result and the bank account (BAS-011–017).
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
    clearError,
    revertCorrection,
    validate,
  } = useBankStatementReconciliation(bankAccountId, parseResult);

  const [screen, setScreen] = useState<"labels" | "settlement">("labels");
  const [activeLine, setActiveLine] = useState<BankStatementLine | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const procedureWindowDays = getProcedureWindowDays();

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

  // Rendered INSIDE the open dialog — the page-body ErrorStep below sits behind
  // the native <dialog> top layer and is invisible while a modal is open.
  const correctionErrorText = error ? t(presentReconciliationError(error).key) : null;

  // --- Screen 1 — label association (BAS-120–121). ---
  if (screen === "labels") {
    return (
      <LabelAssociationScreen
        reconciliation={reconciliation}
        corrections={corrections}
        isBusy={isBusy}
        errorText={correctionErrorText}
        onApplyCorrection={applyCorrection}
        onRevertCorrection={revertCorrection}
        onContinue={() => {
          clearError();
          setScreen("settlement");
        }}
        onCancel={onClose}
      />
    );
  }

  // --- Screen 2 — settlement (BAS-122–123). ---
  // Only the linked labels' lines are settled here; ignored labels' lines
  // were decided on screen 1 and never reappear (BAS-122).
  const visibleLines = reconciliation.lines.filter(
    (line) => line.fund_id !== null && line.status !== "Rejected",
  );
  const settlementReconciliation = { ...reconciliation, lines: visibleLines };
  // BAS-123 — every visible line decided (matched, incl. left-aside); zero
  // lines satisfy the gate vacuously.
  const allLinesDecided = visibleLines.every((line) => line.status === "Matched");

  const handleValidate = async () => {
    const count = await validate();
    if (count !== null) {
      setCreatedCount(count);
    }
  };

  // A rejection message belongs to the dialog it happened in — clear it when
  // the dialog is dismissed or another line is opened, or it would render as
  // a stale error inside the next dialog.
  const openLine = (line: BankStatementLine) => {
    clearError();
    setActiveLine(line);
  };
  const closeDialog = () => {
    clearError();
    setActiveLine(null);
  };

  // Close the dialog only when the correction was accepted; on rejection the
  // dialog stays open and shows the error (BAS-064 — "the frontend signals it").
  // Returns the outcome so the gold action's composed submit can bail out
  // after a rejected first correction.
  const submitAndCloseOnSuccess = async (correction: BankStatementCorrection): Promise<boolean> => {
    const ok = await applyCorrection(correction);
    if (ok) {
      setActiveLine(null);
    }
    return ok;
  };

  return (
    <div className="flex flex-col gap-6 min-h-0">
      <ReconciliationList
        reconciliation={settlementReconciliation}
        onApplyCorrection={openLine}
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

      {correctionErrorText && <ErrorStep error={correctionErrorText} />}

      {/* BAS-122A — pinned screen actions. */}
      <div className="flex items-center justify-between gap-3">
        <Button
          id="reconciliation-back-to-labels"
          variant="ghost"
          disabled={isBusy}
          onClick={() => {
            clearError();
            setScreen("labels");
          }}
        >
          {t("reconciliation.back_to_labels")}
        </Button>
        <Button
          id="reconciliation-validate"
          onClick={handleValidate}
          variant="primary"
          disabled={isBusy || !allLinesDecided}
          loading={isBusy}
        >
          {t("statement.modal.validate")}
        </Button>
      </div>

      {/* Per-line settlement dialog (BAS-062/122B) — label linking lives on screen 1. */}
      {activeLine !== null && (
        <AssignGroupsModal
          line={activeLine}
          isOpen={true}
          errorText={correctionErrorText}
          isBusy={isBusy}
          onSubmit={submitAndCloseOnSuccess}
          onCancel={closeDialog}
          procedureWindowDays={procedureWindowDays}
        />
      )}

      {isWizardOpen && (
        <ReconciliationWizard
          reconciliation={settlementReconciliation}
          isOpen={true}
          errorText={correctionErrorText}
          isBusy={isBusy}
          onApplyCorrection={(correction) => void applyCorrection(correction)}
          onErrorDismiss={clearError}
          procedureWindowDays={procedureWindowDays}
          onComplete={() => {
            clearError();
            setIsWizardOpen(false);
          }}
          onAbandon={() => {
            clearError();
            setIsWizardOpen(false);
          }}
        />
      )}
    </div>
  );
}
