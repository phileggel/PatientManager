import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankStatementCorrection,
  BankStatementLine,
  BankStatementParseResult,
} from "@/bindings";
import { getProcedureWindowDays } from "@/infra/settings/store";
import { Button } from "@/ui/components/button";
import { deriveLabelRows } from "../shared/labelRows";
import { presentReconciliationError } from "../shared/reconciliationPresenter";
import { AssignGroupsModal } from "./AssignGroupsModal";
import { ErrorStep } from "./ErrorStep";
import { LabelAssociationScreen } from "./LabelAssociationScreen";
import { LoadingStep } from "./LoadingStep";
import { RecapStep } from "./RecapStep";
import { ReconciliationList } from "./ReconciliationList";
import { StepBar } from "./StepBar";
import { useBankStatementReconciliation } from "./useBankStatementReconciliation";

interface ReconciliationViewProps {
  bankAccountId: string;
  parseResult: BankStatementParseResult;
  /** Closes the flow at once — once validated, nothing is left to lose. */
  onClose: () => void;
  /** Leaves the flow; asks first when work was done (#696). */
  onCancel: () => void;
  /** Reports whether a correction was made and not validated yet (#696). */
  onWorkChange: (hasWork: boolean) => void;
}

/**
 * #692 — steps 2 to 4 of the bank statement import over one shared draft:
 * the labels (each linked to a fund or ignored), the matching (every line,
 * each opening the « Rapprocher » modal), the recap, which validates.
 *
 * Lives in its own component so the reconciliation hook only mounts once the
 * gate has resolved both the parse result and the bank account (BAS-010).
 */
export function ReconciliationView({
  bankAccountId,
  parseResult,
  onClose,
  onCancel,
  onWorkChange,
}: ReconciliationViewProps) {
  const { t } = useTranslation("bank");
  const {
    reconciliation,
    initialReconciliation,
    corrections,
    isBusy,
    error,
    applyCorrection,
    clearError,
    validate,
  } = useBankStatementReconciliation(bankAccountId, parseResult);

  const [screen, setScreen] = useState<"labels" | "settlement" | "recap">("labels");
  // #692 — each label's link when the matching step was left for the labels.
  const [linksAtMatching, setLinksAtMatching] = useState<ReadonlyMap<string, string | null> | null>(
    null,
  );
  const [activeLine, setActiveLine] = useState<BankStatementLine | null>(null);
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const procedureWindowDays = getProcedureWindowDays();

  // #696 — work exists from the first correction until the validate commit.
  const hasWork = corrections.length > 0 && createdCount === null;
  useEffect(() => {
    onWorkChange(hasWork);
  }, [hasWork, onWorkChange]);

  // Done summary takes over once the validate commit succeeds (BAS-093).
  if (createdCount !== null) {
    return (
      <div className="flex flex-col gap-6">
        {/* #357 — the success text sits on its own green container, as the recap's figures. */}
        <div
          id="reconciliation-done"
          className="space-y-2 rounded-2xl bg-[var(--color-snackbar-success-bg)] px-6 py-10 text-center text-[var(--color-snackbar-success-text)]"
        >
          <p className="text-lg font-semibold">
            {t("statement.modal.done", { count: createdCount })}
          </p>
          <p className="text-sm">{t("statement.modal.done_description")}</p>
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

  // --- Step 2 — the labels (#692). ---
  if (screen === "labels") {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <StepBar current="labels" />
        <LabelAssociationScreen
          reconciliation={reconciliation}
          initialReconciliation={initialReconciliation}
          isBusy={isBusy}
          errorText={correctionErrorText}
          onApplyCorrection={applyCorrection}
          onContinue={() => {
            clearError();
            setScreen("settlement");
          }}
          onCancel={onCancel}
          linksAtMatching={linksAtMatching}
        />
      </div>
    );
  }

  // --- Step 3 — the matching (#692): every line of the statement. ---
  // The recap opens once every line is decided (matched, left aside or
  // ignored); zero lines satisfy the gate vacuously.
  const allLinesDecided = reconciliation.lines.every(
    (line) => line.status === "Matched" || line.status === "Rejected",
  );

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

  // --- Step 4 — the recap (#692). ---
  if (screen === "recap") {
    return (
      <div className="flex flex-col flex-1 gap-6 min-h-0">
        <StepBar current="recap" />
        <RecapStep
          recap={reconciliation.recap}
          isBusy={isBusy}
          errorText={correctionErrorText}
          onCancel={onCancel}
          onBack={() => {
            clearError();
            setScreen("settlement");
          }}
          onValidate={() => void handleValidate()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 gap-6 min-h-0">
      <StepBar current="matching" />
      <ReconciliationList
        reconciliation={reconciliation}
        onApplyCorrection={openLine}
        isBusy={isBusy}
      />

      {correctionErrorText && <ErrorStep error={correctionErrorText} />}

      {/* The step's actions, as on every step. */}
      <div className="flex items-center justify-between gap-3 border-t border-m3-outline/20 pt-4">
        <Button id="reconciliation-cancel" variant="outline" onClick={onCancel}>
          {t("label_association.cancel_all")}
        </Button>
        <div className="flex items-center gap-3">
          <Button
            id="reconciliation-back-to-labels"
            variant="ghost"
            disabled={isBusy}
            onClick={() => {
              clearError();
              setLinksAtMatching(
                new Map(
                  deriveLabelRows(reconciliation.lines).map((row) => [
                    row.label,
                    row.isRejected ? null : row.fundId,
                  ]),
                ),
              );
              setScreen("labels");
            }}
          >
            {t("reconciliation.back_to_labels")}
          </Button>
          <Button
            id="reconciliation-to-recap"
            variant="primary"
            disabled={isBusy || !allLinesDecided}
            onClick={() => {
              clearError();
              setScreen("recap");
            }}
          >
            {t("reconciliation.to_recap")}
          </Button>
        </div>
      </div>

      {/* The « Rapprocher » modal (BAS-062) — label linking lives on step 2. */}
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
    </div>
  );
}
