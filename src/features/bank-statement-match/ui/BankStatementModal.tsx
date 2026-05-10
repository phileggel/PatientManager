import { Loader, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components/button";
import { IconButton } from "@/ui/components/button/IconButton";
import { TextField } from "@/ui/components/field";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import { FundLabelMappingStep } from "./FundLabelMappingStep";
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
          aria-label={t("statement.modal.closeAria")}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader className="w-8 h-8 animate-spin text-m3-primary" />
            <p className="text-m3-on-surface-variant">{t("statement.modal.loading")}</p>
          </div>
        )}

        {step === "matching" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader className="w-8 h-8 animate-spin text-m3-primary" />
            <p className="text-m3-on-surface-variant">{t("statement.modal.matching")}</p>
          </div>
        )}

        {step === "create-account" && parseResult && (
          <form
            id="create-account-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateAccountSubmit();
            }}
          >
            <div className="space-y-1">
              <p className="text-lg font-medium text-m3-on-surface">
                {t("statement.modal.createAccount.title")}
              </p>
              <p className="text-sm text-m3-on-surface-variant">
                {t("statement.modal.createAccount.description", { iban: parseResult.iban })}
              </p>
            </div>
            <TextField
              id="create-account-iban"
              label={t("statement.modal.createAccount.ibanLabel")}
              value={parseResult.iban ?? ""}
              readOnly
              disabled
            />
            <TextField
              id="create-account-name"
              label={t("statement.modal.createAccount.nameLabel")}
              placeholder={t("statement.modal.createAccount.namePlaceholder")}
              value={createName}
              onChange={(e) => handleCreateNameChange(e.target.value)}
              disabled={isCreatingAccount}
              autoFocus
            />
            {createError && (
              <p role="alert" className="text-sm text-m3-error">
                {createError}
              </p>
            )}
          </form>
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

        {step === "done" && (
          <div className="text-center py-12 space-y-4">
            <p className="text-lg font-medium text-m3-on-success-container">
              {t("statement.modal.done", { count: createdCount })}
            </p>
            <p className="text-m3-on-surface-variant">{t("statement.modal.doneDescription")}</p>
          </div>
        )}

        {step === "error" && (
          <div className="text-center py-12 space-y-4">
            <p className="text-lg font-medium text-m3-error">{t("statement.modal.error")}</p>
            <p role="alert" className="text-m3-on-surface-variant">
              {error}
            </p>
          </div>
        )}
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
                ? t("statement.modal.createAccount.submitting")
                : t("statement.modal.createAccount.submit")}
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
              {t("statement.modal.createAccount.cancel")}
            </Button>
          )}
        </div>
      )}
    </ModalContainer>
  );
}
