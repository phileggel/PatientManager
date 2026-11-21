import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useFormatters } from "@/ui/format/formatters";
import { type BankEntryKind, entryKind, paymentMethodKey } from "./shared/presenter";
import { useBankTransferController } from "./useBankTransferController";

/**
 * #642 — the entries one page lists (direct payments or fund wires), narrowed by its
 * search on what a row shows: the date, the amount, the method or the account.
 */
export function useBankEntryManager(kind: BankEntryKind, searchTerm: string) {
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate } = useFormatters();
  const { transfers } = useBankTransferController();

  const entries = useMemo(() => {
    const own = transfers.filter((entry) => entryKind(entry) === kind);
    const term = searchTerm.trim().toLowerCase();
    if (!term) return own;
    return own.filter((entry) => {
      const methodKey = paymentMethodKey(entry.transfer_type);
      const shown = [
        formatDate(entry.transfer_date),
        formatCurrency(entry.amount),
        kind === "fund" ? entry.bank_account.name : methodKey ? t(methodKey) : "",
      ];
      return shown.join(" ").toLowerCase().includes(term);
    });
  }, [transfers, kind, searchTerm, formatDate, formatCurrency, t]);

  return { entries, count: entries.length };
}
