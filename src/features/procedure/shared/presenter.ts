import { isPaidStatus, type ProcedureRow } from "../model/procedure-row.types";

/** All amount fields are in thousandths, matching the `formatCurrency` input contract. */
export interface SummaryStatsViewModel {
  uniquePatients: number;
  procedureCount: number;
  totalAmountThousandths: number;
  totalReceivedThousandths: number;
  totalAwaitedThousandths: number;
}

export function summarizeProcedureRows(rows: ProcedureRow[]): SummaryStatsViewModel {
  const nonDraft = rows.filter((r) => !r.isDraft);

  const uniquePatients = new Set(nonDraft.filter((r) => r.patientId).map((r) => r.patientId)).size;

  const procedureCount = nonDraft.length;

  const totalAmount = nonDraft.reduce((sum, r) => sum + r.billedAmount, 0);

  // Falls back to billedAmount for paid-status procedures whose paid_amount is null.
  const totalReceived = nonDraft.reduce((sum, r) => {
    if (r.paidAmount != null) return sum + r.paidAmount;
    if (isPaidStatus(r.status)) return sum + r.billedAmount;
    return sum;
  }, 0);

  // Outstanding balance = billed − received, floored at 0.
  // Uses the same paid-status fallback so reconciled procedures don't appear as still awaited.
  const totalAwaited = nonDraft.reduce((sum, r) => {
    const received = r.paidAmount ?? (isPaidStatus(r.status) ? r.billedAmount : null);
    const diff = r.billedAmount - (received ?? 0);
    return sum + (diff > 0 ? diff : 0);
  }, 0);

  return {
    uniquePatients,
    procedureCount,
    totalAmountThousandths: Math.round(totalAmount * 1000),
    totalReceivedThousandths: Math.round(totalReceived * 1000),
    totalAwaitedThousandths: Math.round(totalAwaited * 1000),
  };
}
