import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components/button";
import { IconButton } from "@/ui/components/button/IconButton";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { CreateAccountStep } from "./CreateAccountStep";
import { DoneStep } from "./DoneStep";
import { ErrorStep } from "./ErrorStep";
import { FundLabelMappingStep } from "./FundLabelMappingStep";
import { LoadingStep } from "./LoadingStep";
import { MatchResultsStep } from "./MatchResultsStep";
import { useBankStatementModal } from "./useBankStatementModal";

interface BankStatementModalProps {
  filePath: string;
  onClose: () => void;
}

export function BankStatementModal({ filePath, onClose }: BankStatementModalProps) {
  const { t } = useTranslation("bank");
  const {
    step,
    error,
    parseResult,
    labelResolutions,
    allCreditLines,
    userSelections,
    isProcessing,
    createdCount,
    maxDateOffsetDays,
    createName,
    createError,
    isCreatingAccount,
    handleCreateNameChange,
    handleCreateAccountSubmit,
    handleLabelMappingConfirm,
    handleSelectionChange,
    handleCreateTransfers,
  } = useBankStatementModal(filePath);

  return (
    <ModalContainer
      id="bank-statement-modal"
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-2xl"
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
        {step === "loading" && <LoadingStep message={t("statement.modal.loading")} />}

        {step === "matching" && <LoadingStep message={t("statement.modal.matching")} />}

        {step === "create-account" && parseResult && (
          <CreateAccountStep
            iban={parseResult.iban}
            name={createName}
            error={createError}
            isCreating={isCreatingAccount}
            onNameChange={handleCreateNameChange}
            onSubmit={handleCreateAccountSubmit}
          />
        )}

        {step === "label-mapping" && (
          <FundLabelMappingStep
            resolutions={labelResolutions}
            onConfirm={handleLabelMappingConfirm}
            isProcessing={isProcessing}
          />
        )}

        {step === "results" && (
          <MatchResultsStep
            lines={allCreditLines}
            userSelections={userSelections}
            onSelectionChange={handleSelectionChange}
            maxDateOffsetDays={maxDateOffsetDays}
          />
        )}

        {step === "done" && <DoneStep createdCount={createdCount} />}

        {step === "error" && <ErrorStep error={error} />}
      </div>

      {/* Footer — not shown during label-mapping (Accepter is embedded in FundLabelMappingStep) */}
      {step !== "label-mapping" && (
        <div className="flex justify-end gap-3 px-6 py-4 bg-m3-surface-container-low shrink-0 rounded-b-[28px]">
          {step === "results" && (
            <Button
              onClick={handleCreateTransfers}
              variant="primary"
              disabled={isProcessing}
              loading={isProcessing}
            >
              {isProcessing ? t("statement.modal.creating") : t("statement.modal.validate")}
            </Button>
          )}

          {step === "create-account" && (
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
          )}

          {(step === "done" || step === "error") && (
            <Button onClick={onClose} variant="secondary">
              {t("statement.modal.close")}
            </Button>
          )}

          {(step === "loading" || step === "matching" || step === "results") && (
            <Button onClick={onClose} variant="secondary">
              {t("statement.modal.cancel")}
            </Button>
          )}

          {step === "create-account" && (
            <Button onClick={onClose} variant="secondary" disabled={isCreatingAccount}>
              {t("statement.modal.create_account.cancel")}
            </Button>
          )}
        </div>
      )}
    </ModalContainer>
  );
}
