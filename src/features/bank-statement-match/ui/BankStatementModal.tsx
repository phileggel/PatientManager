import { Loader } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BankAccount,
  BankStatementParseResult,
  FundLabelResolution,
  ResolvedCreditLine,
} from "@/bindings";
import { useSnackbar } from "@/core/snackbar";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components/button";
import { ModalContainer } from "@/ui/components/modal/ModalContainer";
import {
  createBankTransfersFromStatement,
  matchBankStatementLines,
  parseBankStatement,
  resolveBankAccountFromIban,
  resolveBankFundLabels,
  saveBankFundLabelMappings,
} from "../gateway";
import { FundLabelMappingStep } from "./FundLabelMappingStep";
import { MatchResultsStep } from "./MatchResultsStep";

const TAG = "[BankStatementModal]";

type Step = "loading" | "no-account" | "label-mapping" | "matching" | "results" | "done" | "error";

export interface IdentifiableCreditLine extends ResolvedCreditLine {
  lineId: string;
}

interface BankStatementModalProps {
  file: File;
  onClose: () => void;
}

export function BankStatementModal({ file, onClose }: BankStatementModalProps) {
  const { t } = useTranslation("bank");
  const [step, setStep] = useState<Step>("loading");
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<BankStatementParseResult | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [labelResolutions, setLabelResolutions] = useState<FundLabelResolution[]>([]);
  const [allCreditLines, setAllCreditLines] = useState<IdentifiableCreditLine[]>([]);
  const [userSelections, setUserSelections] = useState<Map<string, string | null>>(new Map()); // lineId -> groupId
  const [isProcessing, setIsProcessing] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const { showSnackbar } = useSnackbar();

  const proceedToMatching = useCallback(
    async (parsed: BankStatementParseResult, resolutions: FundLabelResolution[]) => {
      setStep("matching");

      // Build resolved lines with unique IDs
      const resolvedLines: IdentifiableCreditLine[] = [];
      for (const line of parsed.credit_lines) {
        const resolution = resolutions.find((r) => r.bank_label === line.label);
        const fundId = resolution?.fund_id || resolution?.suggested_fund_id;
        if (fundId) {
          resolvedLines.push({
            date: line.date,
            label: line.label,
            amount: line.amount,
            fund_id: fundId,
            lineId: crypto.randomUUID(),
          });
        }
      }

      if (resolvedLines.length === 0) {
        setError(t("statement.modal.noCredit"));
        setStep("error");
        return;
      }

      setAllCreditLines(resolvedLines);

      // Match against unsettled groups via backend
      try {
        const result = await matchBankStatementLines(resolvedLines);

        // Initialize user selections with backend proposals
        const initialSelections = new Map<string, string | null>();
        for (const line of resolvedLines) {
          const match = result.matched.find(
            (m) =>
              m.credit_line.date === line.date &&
              m.credit_line.label === line.label &&
              m.credit_line.amount === line.amount,
          );
          initialSelections.set(line.lineId, match?.group_id || null);
        }

        setUserSelections(initialSelections);
        setStep("results");
        logger.info(
          TAG,
          `Initial matching: ${result.matched.length} suggested, ${result.unmatched_lines.length} unmatched`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStep("error");
      }
    },
    [t],
  );

  // Step 1: Parse PDF and resolve bank account
  useEffect(() => {
    async function loadAndParse() {
      try {
        logger.info(TAG, "Processing bank statement", { name: file.name });

        // Parse PDF
        const parsed = await parseBankStatement(file);
        setParseResult(parsed);
        logger.info(
          TAG,
          `Parsed: ${parsed.credit_lines.length} credit lines, IBAN: ${parsed.iban}`,
        );

        if (!parsed.iban) {
          setError(t("statement.modal.noIban"));
          setStep("error");
          return;
        }

        // Resolve bank account from IBAN
        const account = await resolveBankAccountFromIban(parsed.iban);
        if (!account) {
          setStep("no-account");
          return;
        }
        setBankAccount(account);
        logger.info(TAG, `Bank account resolved: ${account.name}`);

        // Resolve fund labels
        const labels = parsed.credit_lines.map((l) => l.label);
        const resolutions = await resolveBankFundLabels(account.id, labels);
        setLabelResolutions(resolutions);

        // Check if any labels need mapping
        const unmapped = resolutions.filter((r) => !r.is_confirmed && !r.is_rejected);
        if (unmapped.length > 0) {
          logger.info(TAG, `${unmapped.length} labels need mapping`);
          setStep("label-mapping");
        } else {
          // All labels mapped, proceed to matching
          await proceedToMatching(parsed, resolutions);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(TAG, "Failed to process bank statement", { message: msg, error: err });
        setError(msg || "Unknown error");
        setStep("error");
      }
    }

    loadAndParse();
  }, [file, proceedToMatching, t]);

  const handleLabelMappingConfirm = async (
    mappings: Map<string, string>, // bankLabel → fundId
  ) => {
    if (!bankAccount || !parseResult) return;

    try {
      setIsProcessing(true);

      // Save new mappings
      const newMappings = Array.from(mappings.entries()).map(([bank_label, fund_id]) => ({
        bank_label,
        fund_id,
      }));
      if (newMappings.length > 0) {
        await saveBankFundLabelMappings(bankAccount.id, newMappings);
      }

      // Update resolutions with confirmed mappings
      const updatedResolutions = labelResolutions.map((r) => {
        const newFundId = mappings.get(r.bank_label);
        if (newFundId) {
          return {
            ...r,
            fund_id: newFundId === "REJECTED" ? null : newFundId,
            is_confirmed: true,
            is_rejected: newFundId === "REJECTED",
          };
        }
        return r;
      });
      setLabelResolutions(updatedResolutions);

      await proceedToMatching(parseResult, updatedResolutions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(TAG, "Failed to save label mappings", msg);
      setError(msg);
      setStep("error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectionChange = (lineId: string, groupId: string | null) => {
    setUserSelections((prev) => {
      const next = new Map(prev);
      next.set(lineId, groupId);
      return next;
    });
  };

  const handleCreateTransfers = async () => {
    if (!bankAccount) return;

    try {
      setIsProcessing(true);

      const confirmedMatches = [];
      for (const line of allCreditLines) {
        const groupId = userSelections.get(line.lineId);
        if (groupId) {
          confirmedMatches.push({
            group_id: groupId,
            date: line.date,
            amount: line.amount,
          });
        }
      }

      if (confirmedMatches.length === 0) {
        showSnackbar("error", t("statement.modal.noTransfer"));
        setIsProcessing(false);
        return;
      }

      const count = await createBankTransfersFromStatement(bankAccount.id, confirmedMatches);
      setCreatedCount(count);
      setStep("done");
      logger.info(TAG, `Created ${count} bank transfers`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(TAG, "Failed to create bank transfers", msg);
      setError(msg);
      setStep("error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ModalContainer isOpen={true} onClose={onClose} maxWidth="max-w-4xl">
      <div className="flex flex-col h-full overflow-hidden bg-surface rounded-2xl shadow-elevation-3">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-20 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-neutral-90">{t("statement.title")}</h2>
            <p className="text-sm text-neutral-60">{file.name}</p>
            {parseResult?.period && <p className="text-xs text-neutral-50">{parseResult.period}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-20 transition-colors"
            aria-label={t("statement.modal.closeAria")}
          >
            <span className="text-xl">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader className="w-8 h-8 animate-spin text-primary-60" />
              <p className="text-neutral-60">{t("statement.modal.loading")}</p>
            </div>
          )}

          {step === "matching" && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader className="w-8 h-8 animate-spin text-primary-60" />
              <p className="text-neutral-60">{t("statement.modal.matching")}</p>
            </div>
          )}

          {step === "no-account" && parseResult && (
            <div className="text-center py-12 space-y-4">
              <p className="text-lg font-medium text-neutral-90">
                {t("statement.modal.noAccount.title")}
              </p>
              <p className="text-neutral-60">
                {t("statement.modal.noAccount.description", { iban: parseResult.iban })}
              </p>
              <p className="text-sm text-neutral-50">{t("statement.modal.noAccount.hint")}</p>
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
            />
          )}

          {step === "done" && (
            <div className="text-center py-12 space-y-4">
              <p className="text-lg font-medium text-success-70">
                {t("statement.modal.done", { count: createdCount })}
              </p>
              <p className="text-neutral-60">{t("statement.modal.doneDescription")}</p>
            </div>
          )}

          {step === "error" && (
            <div className="text-center py-12 space-y-4">
              <p className="text-lg font-medium text-error-70">{t("statement.modal.error")}</p>
              <p className="text-neutral-60">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-20 shrink-0">
          {step === "results" && (
            <Button onClick={handleCreateTransfers} variant="primary" disabled={isProcessing}>
              {isProcessing ? t("statement.modal.creating") : t("statement.modal.validate")}
            </Button>
          )}

          {(step === "done" || step === "error" || step === "no-account") && (
            <Button onClick={onClose} variant="primary">
              {t("statement.modal.close")}
            </Button>
          )}

          {(step === "loading" || step === "matching" || step === "results") && (
            <Button onClick={onClose} variant="secondary">
              {t("statement.modal.cancel")}
            </Button>
          )}
        </div>
      </div>
    </ModalContainer>
  );
}
