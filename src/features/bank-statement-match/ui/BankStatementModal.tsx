import { Loader, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/components/button";
import { IconButton } from "@/ui/components/button/IconButton";
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
    handleLabelMappingConfirm,
    handleSelectionChange,
    handleCreateTransfers,
  } = useBankStatementModal(filePath);

  return (
    <ModalContainer isOpen={true} onClose={onClose} maxWidth="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-m3-surface-container-low shrink-0 rounded-t-[28px]">
        <div>
          <h2 className="text-lg font-semibold text-m3-on-surface">{t("statement.title")}</h2>
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

        {step === "no-account" && parseResult && (
          <div className="text-center py-12 space-y-4">
            <p className="text-lg font-medium text-m3-on-surface">
              {t("statement.modal.noAccount.title")}
            </p>
            <p className="text-m3-on-surface-variant">
              {t("statement.modal.noAccount.description", { iban: parseResult.iban })}
            </p>
            <p className="text-sm text-m3-on-surface-variant">
              {t("statement.modal.noAccount.hint")}
            </p>
          </div>
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

          {(step === "done" || step === "error" || step === "no-account") && (
            <Button onClick={onClose} variant="secondary">
              {t("statement.modal.close")}
            </Button>
          )}

          {(step === "loading" || step === "matching" || step === "results") && (
            <Button onClick={onClose} variant="secondary">
              {t("statement.modal.cancel")}
            </Button>
          )}
        </div>
      )}
    </ModalContainer>
  );
}
