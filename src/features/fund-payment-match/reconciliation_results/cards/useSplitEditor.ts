/**
 * useSplitEditor — the rows of a split of a not-found PDF line (FPA-252, FPA-252A, FPA-253) and
 * the backend's answer when the card validates them (FPA-254A, FPA-258).
 *
 * The screen never judges the split (F30): the total is display only, and the
 * backend's refusals come back as messages under the total and each row.
 */

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NormalizedPdfLine, SplitPart } from "@/bindings";
import { logger } from "@/infra/logger";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../../gateway";
import {
  formatReconciliationError,
  type SplitFieldErrorKeys,
  splitFieldErrorKeys,
} from "../../shared/errorPresenter";

const TAG = "[useSplitEditor]";

export interface SplitRow {
  date: string;
  /** Euros as typed, or null when the amount is empty. */
  amount: number | null;
}

/** The i18n keys of a refused split's messages (F27: the component translates them). */
type SplitErrors = SplitFieldErrorKeys;

const NO_ERRORS: SplitErrors = { parts: [] };

export function useSplitEditor(line: NormalizedPdfLine, onAccept: (parts: SplitPart[]) => void) {
  const { t } = useTranslation("fund-payment-match");
  const [rows, setRows] = useState<SplitRow[]>([{ date: line.procedure_start_date, amount: null }]);
  const [errors, setErrors] = useState<SplitErrors>(NO_ERRORS);
  const [checking, setChecking] = useState(false);

  // A row's message clears once that field is edited (F30); the split's, once any amount is.
  const clearPartError = useCallback((index: number, field: "date" | "amount") => {
    setErrors((prev) => ({
      split: field === "amount" ? undefined : prev.split,
      parts: prev.parts.map((part, i) => {
        if (i !== index) return part;
        const { [field]: _cleared, ...rest } = part;
        return rest;
      }),
    }));
  }, []);

  const setDate = useCallback(
    (index: number, date: string) => {
      setRows((prev) => prev.map((row, i) => (i === index ? { ...row, date } : row)));
      clearPartError(index, "date");
    },
    [clearPartError],
  );

  const setAmount = useCallback(
    (index: number, amount: number | null) => {
      setRows((prev) => prev.map((row, i) => (i === index ? { ...row, amount } : row)));
      clearPartError(index, "amount");
    },
    [clearPartError],
  );

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { date: line.procedure_start_date, amount: null }]);
  }, [line.procedure_start_date]);

  const removeRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setErrors(NO_ERRORS);
  }, []);

  // Display only (FPA-252, FPA-253): the backend judges whether it adds up.
  const total = useMemo(
    () => rows.reduce((sum, row) => sum + Math.round((row.amount ?? 0) * 1000), 0),
    [rows],
  );

  const validate = useCallback(async () => {
    const parts: SplitPart[] = rows.map((row) => ({
      procedure_date: row.date,
      billed_amount: row.amount == null ? null : Math.round(row.amount * 1000),
    }));
    setErrors(NO_ERRORS);
    setChecking(true);
    try {
      const result = await gateway.checkSplitIntoProcedures(line, parts);
      if (result.success) {
        onAccept(parts);
        return;
      }
      logger.info(`${TAG} Split refused`, { code: result.error.code });
      const keys = splitFieldErrorKeys(result.error);
      if (keys) {
        setErrors(keys);
        return;
      }
      const { key, params } = formatReconciliationError(result.error);
      toastService.show("error", t(key, params));
    } catch (err) {
      logger.error(`${TAG} Split check threw`, { err });
      toastService.show("error", t("modal.error.unknown"));
    } finally {
      setChecking(false);
    }
  }, [rows, line, onAccept, t]);

  return { rows, total, errors, checking, setDate, setAmount, addRow, removeRow, validate };
}
