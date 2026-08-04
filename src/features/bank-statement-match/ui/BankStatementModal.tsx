import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components/button";
import { IconButton } from "@/ui/components/button/IconButton";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { CreateAccountStep } from "./CreateAccountStep";
import { ErrorStep } from "./ErrorStep";
import { LoadingStep } from "./LoadingStep";
import { ReconciliationView } from "./ReconciliationView";
import { useBankStatementGate } from "./useBankStatementGate";

interface BankStatementModalProps {
  filePath: string;
  onClose: () => void;
}

/**
 * Host for the bank-statement reconciliation flow.
 *
 * Phase 1 (gate): parse the PDF + resolve the IBAN, inline-creating the bank
 * account when the IBAN is unknown (BAS-011–017).
 * Phase 2 (ready): hand over to `ReconciliationView`, which drives the
 * document-order list, correction modals, wizard, and validate (BAS-060–103).
 */
export function BankStatementModal({ filePath, onClose }: BankStatementModalProps) {
  const { t } = useTranslation("bank");
  const {
    phase,
    error,
    parseResult,
    bankAccount,
    createName,
    createError,
    isCreatingAccount,
    handleCreateNameChange,
    handleCreateAccountSubmit,
  } = useBankStatementGate(filePath);

  return (
    <ModalContainer
      id="bank-statement-modal"
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-4xl"
      titleId="bank-statement-modal-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-m3-surface-container-low shrink-0 rounded-t-[28px]">
        <div>
          <h2 id="bank-statement-modal-title" className="text-lg font-semibold text-m3-on-surface">
            {t("statement.title")}
          </h2>
          <p className="text-sm text-m3-on-surface-variant">{filePath.split(/[\\/]/).pop()}</p>
          {parseResult?.period && (
            <p className="text-xs text-m3-on-surface-variant">{parseResult.period}</p>
          )}
          {/* BAS-022 — lines the parser could not read must not vanish silently. */}
          {parseResult !== null && parseResult.unparsed_count > 0 && (
            <p
              id="bank-statement-modal-unparsed-warning"
              role="alert"
              className="text-xs font-medium text-m3-error"
            >
              {t("statement.modal.unparsed_warning", { count: parseResult.unparsed_count })}
            </p>
          )}
        </div>
        <IconButton
          icon={<X size={20} />}
          variant="ghost"
          shape="round"
          onClick={onClose}
          aria-label={t("statement.modal.close_aria")}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {phase === "loading" && <LoadingStep message={t("statement.modal.loading")} />}

        {phase === "create-account" && parseResult && (
          <CreateAccountStep
            iban={parseResult.iban}
            name={createName}
            error={createError}
            isCreating={isCreatingAccount}
            onNameChange={handleCreateNameChange}
            onSubmit={handleCreateAccountSubmit}
          />
        )}

        {phase === "ready" && bankAccount && parseResult && (
          <ReconciliationView
            bankAccountId={bankAccount.id}
            parseResult={parseResult}
            onClose={onClose}
          />
        )}

        {phase === "error" && <ErrorStep error={error} />}
      </div>

      {/* Footer — the reconciliation phase renders its own actions inside ReconciliationView. */}
      {phase !== "ready" && (
        <div className="flex justify-end gap-3 px-6 py-4 bg-m3-surface-container-low shrink-0 rounded-b-[28px]">
          {phase === "create-account" && (
            <>
              <Button
                type="submit"
                form="create-account-form"
                variant="primary"
                disabled={isCreatingAccount}
                loading={isCreatingAccount}
              >
                {isCreatingAccount
                  ? t("statement.modal.create_account.submitting")
                  : t("statement.modal.create_account.submit")}
              </Button>
              <Button onClick={onClose} variant="secondary" disabled={isCreatingAccount}>
                {t("statement.modal.create_account.cancel")}
              </Button>
            </>
          )}

          {phase === "error" && (
            <Button onClick={onClose} variant="secondary">
              {t("statement.modal.close")}
            </Button>
          )}

          {phase === "loading" && (
            <Button onClick={onClose} variant="secondary">
              {t("statement.modal.cancel")}
            </Button>
          )}
        </div>
      )}
    </ModalContainer>
  );
}
