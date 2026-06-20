import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount, BankStatementParseResult } from "@/bindings";
import { logger } from "@/infra/logger";
import { createBankAccount, parseBankStatement, resolveBankAccountFromIban } from "../gateway";
import { formatBankStatementError } from "../shared/errorPresenter";

const TAG = "[BankStatementGate]";

/**
 * The gate phase that precedes the reconciliation list: parse the PDF, resolve
 * the IBAN to a bank account, and — when the IBAN is unknown — drive the inline
 * create-account form (BAS-011–017). Once `parseResult` + `bankAccount` are both
 * resolved, the host hands over to `useBankStatementReconciliation`.
 */
export type GatePhase = "loading" | "create-account" | "ready" | "error";

export interface UseBankStatementGateReturn {
  phase: GatePhase;
  error: string | null;
  parseResult: BankStatementParseResult | null;
  bankAccount: BankAccount | null;
  // BAS-011..017 — inline create-account state
  createName: string;
  createError: string | null;
  isCreatingAccount: boolean;
  handleCreateNameChange: (value: string) => void;
  handleCreateAccountSubmit: () => Promise<void>;
}

export function useBankStatementGate(filePath: string): UseBankStatementGateReturn {
  const { t } = useTranslation("bank");

  const [phase, setPhase] = useState<GatePhase>("loading");
  // Holds an untranslated i18n key (or null); translated at render so a locale
  // switch does not re-fire the parse/resolve IPC via the effect below.
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<BankStatementParseResult | null>(null);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);
  // BAS-011..017 — inline create-account state
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadAndResolve() {
      logger.info(TAG, "Processing bank statement", { filePath });

      // R26: the `NoSepaCreditLines` code maps (via the presenter) to the
      // dedicated "no SEPA lines" guidance; every other code → generic error.
      const parsedRes = await parseBankStatement(filePath);
      if (!isMounted) return;
      if (!parsedRes.success) {
        logger.error(TAG, "Failed to parse bank statement", { code: parsedRes.error.code });
        setErrorKey(formatBankStatementError(parsedRes.error).key);
        setPhase("error");
        return;
      }
      const parsed = parsedRes.data;
      setParseResult(parsed);

      if (!parsed.iban) {
        setErrorKey("statement.modal.no_iban");
        setPhase("error");
        return;
      }

      const accountRes = await resolveBankAccountFromIban(parsed.iban);
      if (!isMounted) return;
      if (!accountRes.success) {
        logger.error(TAG, "Failed to resolve bank account", { code: accountRes.error.code });
        setErrorKey(formatBankStatementError(accountRes.error).key);
        setPhase("error");
        return;
      }
      const account = accountRes.data;
      if (!account) {
        // BAS-011 — IBAN unknown: drive the inline create form instead of dead-ending.
        setPhase("create-account");
        return;
      }
      setBankAccount(account);
      setPhase("ready");
      logger.info(TAG, `Bank account resolved: ${account.name}`);
    }

    loadAndResolve();
    return () => {
      isMounted = false;
    };
  }, [filePath]);

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
      setCreateError(t("statement.modal.create_account.name_required"));
      return;
    }

    setIsCreatingAccount(true);
    setCreateError(null);
    try {
      const result = await createBankAccount(trimmedName, parseResult.iban);
      if (!result.success) {
        // BAS-016 — branch on the typed error code directly (F27): the IBAN
        // conflict gets dedicated guidance, every other variant the generic key.
        const isIbanConflict = result.error.code === "IbanAlreadyUsed";
        setCreateError(
          isIbanConflict
            ? t("statement.modal.create_account.error_iban_already_used")
            : t("statement.modal.create_account.error_unknown"),
        );
        return;
      }
      const account = result.data;
      setBankAccount(account);
      // BAS-014 — workflow continuation: hand over to the reconciliation list.
      setPhase("ready");
      logger.info(TAG, `Bank account created inline: ${account.name}`);
    } finally {
      setIsCreatingAccount(false);
    }
  }, [createName, parseResult, t]);

  return {
    phase,
    error: errorKey === null ? null : t(errorKey),
    parseResult,
    bankAccount,
    createName,
    createError,
    isCreatingAccount,
    handleCreateNameChange,
    handleCreateAccountSubmit,
  };
}
