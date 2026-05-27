import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount, BankStatementParseResult, FundLabelResolution } from "@/bindings";
import { formatBankError } from "@/features/bank-account/shared/presenter";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import {
  createBankAccount,
  createBankTransfersFromStatement,
  getBankStatementReconciliationConfig,
  matchBankStatementLines,
  parseBankStatement,
  resolveBankAccountFromIban,
  resolveBankFundLabels,
  saveBankFundLabelMappings,
} from "../gateway";
import type { IdentifiableCreditLine } from "./types";

const TAG = "[BankStatementModal]";

export type Step =
  | "loading"
  | "create-account"
  | "label-mapping"
  | "matching"
  | "results"
  | "done"
  | "error";

export interface UseBankStatementModalReturn {
  step: Step;
  error: string | null;
  parseResult: BankStatementParseResult | null;
  labelResolutions: FundLabelResolution[];
  allCreditLines: IdentifiableCreditLine[];
  userSelections: Map<string, string | null>;
  isProcessing: boolean;
  createdCount: number;
  maxDateOffsetDays: number;
  // BAS-011..017 — inline create-account state
  createName: string;
  createError: string | null;
  isCreatingAccount: boolean;
  handleCreateNameChange: (value: string) => void;
  handleCreateAccountSubmit: () => Promise<void>;
  handleLabelMappingConfirm: (mappings: Map<string, string>) => Promise<void>;
  handleSelectionChange: (lineId: string, groupId: string | null) => void;
  handleCreateTransfers: () => Promise<void>;
}

export function useBankStatementModal(filePath: string): UseBankStatementModalReturn {
  const { t } = useTranslation("bank");

  const [step, setStep] = useState<Step>("loading");
  const [maxDateOffsetDays, setMaxDateOffsetDays] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<BankStatementParseResult | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  const [labelResolutions, setLabelResolutions] = useState<FundLabelResolution[]>([]);
  const [allCreditLines, setAllCreditLines] = useState<IdentifiableCreditLine[]>([]);
  const [userSelections, setUserSelections] = useState<Map<string, string | null>>(new Map());
  const [isProcessing, setIsProcessing] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  // BAS-011..017 — inline create-account state
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  useEffect(() => {
    logger.info(TAG, "mounted");
  }, []);

  useEffect(() => {
    let isMounted = true;
    getBankStatementReconciliationConfig()
      .then((config) => {
        if (!isMounted) return;
        setMaxDateOffsetDays(config.max_date_offset_days);
      })
      .catch((err) => {
        logger.error(TAG, "Failed to load reconciliation config, using default", { error: err });
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const proceedToMatching = useCallback(
    async (parsed: BankStatementParseResult, resolutions: FundLabelResolution[]) => {
      setStep("matching");

      const resolvedLines: IdentifiableCreditLine[] = [];
      for (const line of parsed.credit_lines) {
        const resolution = resolutions.find((r) => r.bank_label === line.label);
        // R8: rejected labels are excluded from matching
        if (!resolution || resolution.is_rejected) continue;
        const fundId = resolution.fund_id;
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

      try {
        const result = await matchBankStatementLines(resolvedLines);

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
        logger.error(TAG, "Failed to match bank statement lines", { message: msg });
        setError(t("statement.modal.unknownError"));
        setStep("error");
      }
    },
    [t],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadAndParse() {
      try {
        logger.info(TAG, "Processing bank statement", { filePath });

        const parsed = await parseBankStatement(filePath);
        if (!isMounted) return;
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

        const account = await resolveBankAccountFromIban(parsed.iban);
        if (!isMounted) return;
        if (!account) {
          // BAS-011 — IBAN unknown: drive the inline create form instead of dead-ending.
          setStep("create-account");
          return;
        }
        setBankAccount(account);
        logger.info(TAG, `Bank account resolved: ${account.name}`);

        const labels = parsed.credit_lines.map((l) => l.label);
        const resolutions = await resolveBankFundLabels(account.id, labels);
        if (!isMounted) return;
        setLabelResolutions(resolutions);

        // R7: always show label-mapping step for all labels (confirmed pre-filled, unknown empty)
        logger.info(TAG, `${resolutions.length} labels to review in mapping step`);
        setStep("label-mapping");
      } catch (err) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        // R26: dedicated message when no VIR SEPA lines found
        if (msg === "NO_VIR_SEPA_LINES") {
          logger.error(TAG, "No VIR SEPA lines found in bank statement");
          setError(t("statement.modal.noVirSepaLines"));
          setStep("error");
          return;
        }
        logger.error(TAG, "Failed to process bank statement", { message: msg, error: err });
        setError(t("statement.modal.unknownError"));
        setStep("error");
      }
    }

    loadAndParse();
    return () => {
      isMounted = false;
    };
  }, [filePath, t]);

  // BAS-016 — typing clears any previous backend error so the user can retry cleanly.
  const handleCreateNameChange = useCallback((value: string) => {
    setCreateName(value);
    setCreateError(null);
  }, []);

  // BAS-012/013/014/015/016 — submit the inline create form.
  const handleCreateAccountSubmit = useCallback(async () => {
    if (!parseResult?.iban) return;

    const trimmedName = createName.trim();
    if (trimmedName.length === 0) {
      setCreateError(t("statement.modal.createAccount.nameRequired"));
      return;
    }

    setIsCreatingAccount(true);
    setCreateError(null);
    try {
      const result = await createBankAccount(trimmedName, parseResult.iban);
      if (!result.success) {
        // BAS-016 — route the IBAN-conflict branching through the presenter so
        // F27 Layer 3 stays the only place that maps error variants to keys.
        const { key } = formatBankError(result.error);
        const isIbanConflict = key === "bank:errors.iban_already_used";
        setCreateError(
          isIbanConflict
            ? t("statement.modal.createAccount.errorIbanAlreadyUsed")
            : t("statement.modal.createAccount.errorUnknown"),
        );
        return;
      }
      const account = result.data;
      setBankAccount(account);
      logger.info(TAG, `Bank account created inline: ${account.name}`);

      const labels = parseResult.credit_lines.map((l) => l.label);
      const resolutions = await resolveBankFundLabels(account.id, labels);
      setLabelResolutions(resolutions);
      // BAS-014 — workflow continuation: proceed to label-mapping with the new account.
      setStep("label-mapping");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(TAG, "Inline create-account failed", { message: msg });
      setCreateError(t("statement.modal.unknownError"));
    } finally {
      setIsCreatingAccount(false);
    }
  }, [createName, parseResult, t]);

  const handleLabelMappingConfirm = useCallback(
    async (mappings: Map<string, string>) => {
      if (!bankAccount || !parseResult) return;

      try {
        setIsProcessing(true);

        const newMappings = Array.from(mappings.entries()).map(([bank_label, fund_id]) => ({
          bank_label,
          fund_id,
        }));
        if (newMappings.length > 0) {
          await saveBankFundLabelMappings(bankAccount.id, newMappings);
        }

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
        logger.error(TAG, "Failed to save label mappings", { message: msg });
        setError(t("statement.modal.unknownError"));
        setStep("error");
      } finally {
        setIsProcessing(false);
      }
    },
    [bankAccount, parseResult, labelResolutions, proceedToMatching, t],
  );

  const handleSelectionChange = useCallback((lineId: string, groupId: string | null) => {
    setUserSelections((prev) => {
      const next = new Map(prev);
      next.set(lineId, groupId);
      return next;
    });
  }, []);

  const handleCreateTransfers = useCallback(async () => {
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
        toastService.show("error", t("statement.modal.noTransfer"));
        setIsProcessing(false);
        return;
      }

      const count = await createBankTransfersFromStatement(bankAccount.id, confirmedMatches);
      setCreatedCount(count);
      setStep("done");
      logger.info(TAG, `Created ${count} bank transfers`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(TAG, "Failed to create bank transfers", { message: msg });
      setError(t("statement.modal.unknownError"));
      setStep("error");
    } finally {
      setIsProcessing(false);
    }
  }, [bankAccount, allCreditLines, userSelections, t]);

  return {
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
  };
}
