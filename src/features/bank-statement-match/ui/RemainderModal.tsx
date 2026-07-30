import { useTranslation } from "react-i18next";
import type { BankStatementCorrection, BankStatementLine } from "@/bindings";
import { Button } from "@/ui/components/button";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { toEuros } from "../shared/reconciliationPresenter";

interface RemainderModalProps {
  line: BankStatementLine;
  isOpen: boolean;
  onSubmit: (correction: BankStatementCorrection) => void;
  onCancel: () => void;
  /** Rejection message from the last correction attempt, shown inside the dialog. */
  errorText?: string | null;
}

/**
 * BAS-092 — acknowledge the uncovered remainder on a partially-covered line.
 *
 * The remainder (line amount − covered amount) is shown so the user sees exactly
 * what they are accepting. Confirming produces an `AcknowledgeRemainder` correction.
 */
export function RemainderModal({
  line,
  isOpen,
  onSubmit,
  onCancel,
  errorText,
}: RemainderModalProps) {
  const { t } = useTranslation("bank");
  const remainder = line.credit_line.amount - line.covered_amount;

  return (
    <ModalContainer
      id="remainder-modal"
      isOpen={isOpen}
      onClose={onCancel}
      titleId="remainder-modal-title"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id="remainder-modal-title" className="text-base font-semibold text-m3-on-surface">
          {t("reconciliation.remainder.title")}
        </h2>

        <output id="remainder-modal-amount" className="text-sm text-m3-on-surface">
          {t("reconciliation.remainder.amount", { amount: toEuros(remainder) })}
        </output>

        {errorText && (
          <p id="remainder-modal-error" role="alert" className="text-sm text-m3-error">
            {errorText}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button id="remainder-modal-cancel" variant="secondary" onClick={onCancel}>
            {t("reconciliation.remainder.cancel")}
          </Button>
          <Button
            id="remainder-modal-confirm"
            variant="primary"
            onClick={() => onSubmit({ type: "AcknowledgeRemainder", line_id: line.line_id })}
          >
            {t("reconciliation.remainder.confirm")}
          </Button>
        </div>
      </div>
    </ModalContainer>
  );
}
