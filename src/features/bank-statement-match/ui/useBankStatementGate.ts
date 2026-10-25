import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BankAccount, BankStatementParseResult } from "@/bindings";
import { logger } from "@/infra/logger";
import { createBankAccount, parseBankStatement, resolveBankAccountFromIban } from "../gateway";
import { formatBankStatementError, formatCreateAccountError } from "../shared/errorPresenter";

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

  // Ticket #482 — a new file starts from the initial state. Reset during render
  // (React's "adjusting state when a prop changes"), so no frame shows the
  // previous file's phase before the effect below runs.
  const [gatedFilePath, setGatedFilePath] = useState(filePath);
  if (gatedFilePath !== filePath) {
    setGatedFilePath(filePath);
    setPhase("loading");
    setErrorKey(null);
    setParseResult(null);
    setBankAccount(null);
    setCreateName("");
    setCreateError(null);
    setIsCreatingAccount(false);
  }
  // The file the gate shows now: a create-account call started on an earlier file
  // drops its result instead of resolving the new file's gate.
  const currentFilePath = useRef(filePath);
  currentFilePath.current = filePath;

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
      logger.info(TAG, "Bank account resolved", { accountId: account.id });
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

    const submittedFilePath = filePath;
    setIsCreatingAccount(true);
    setCreateError(null);
    try {
      const result = await createBankAccount(trimmedName, parseResult.iban);
      if (currentFilePath.current !== submittedFilePath) return;
      if (!result.success) {
        // BAS-016 — the presenter picks the reason's key (F27).
        setCreateError(t(formatCreateAccountError(result.error).key));
        return;
      }
      const account = result.data;
      setBankAccount(account);
      // BAS-014 — workflow continuation: hand over to the reconciliation list.
      setPhase("ready");
      logger.info(TAG, "Bank account created inline", { accountId: account.id });
    } finally {
      if (currentFilePath.current === submittedFilePath) setIsCreatingAccount(false);
    }
  }, [createName, filePath, parseResult, t]);

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
