import type { AffiliatedFund, FundPaymentGroup, Procedure } from "@/bindings";
import type { FundDisplayData, FundPaymentRow } from "./types";

/**
 * FundPaymentPresenter - UI Projection of AffiliatedFund Domain Object
 *
 * Transforms the AffiliatedFund domain model into UI representations
 * for the fund-payment context, ensuring the UI doesn't directly depend
 * on domain fields and properties.
 *
 * This centralizes field extraction logic and makes transformations reusable
 * across different parts of the application.
 */
/**
 * Format an ISO date string (YYYY-MM-DD) as a French locale date string (fr-FR).
 * Forces UTC midnight to avoid timezone-related day shift.
 */
/**
 * Format an amount stored in thousandths (i64) as a Euro string (e.g. "€12.50").
 */
export function formatAmountEUR(thousandths: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    (thousandths ?? 0) / 1000,
  );
}

export function formatDateFR(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR").format(date);
}

export const FundPaymentPresenter = {
  /**
   * Transform domain FundPaymentGroup to UI row data for table display
   * Extracts display fields and adds UI-specific properties
   */
  toRow(group: FundPaymentGroup, funds: AffiliatedFund[]): FundPaymentRow {
    const fund = funds.find((f) => f.id === group.fund_id);
    return {
      rowId: group.id,
      id: group.id,
      fundId: group.fund_id,
      fundName: fund ? `${fund.fund_identifier} - ${fund.name}` : group.fund_id,
      paymentDate: group.payment_date,
      // Convert from thousandths (i64) to euros for display
      totalAmount: group.total_amount / 1000,
      procedureCount: group.lines.length,
      isLocked: group.is_locked ?? false,
    };
  },
  /**
   * Transform domain AffiliatedFund to UI display data
   * Extracts only the fields needed for display in fund-payment UI
   * Used to show fund info in modals and panels
   */
  toDisplayData(fund: AffiliatedFund | undefined): FundDisplayData | null {
    if (!fund) return null;

    return {
      fundIdentifier: fund.fund_identifier,
      fundName: fund.name,
    };
  },

  /**
   * Transform array of AffiliatedFund to selector options
   * Used for dropdowns and selection lists
   */
  toSelectorOptions(
    funds: AffiliatedFund[],
    placeholderLabel: string,
  ): Array<{ label: string; value: string }> {
    return [
      { label: placeholderLabel, value: "" },
      ...funds
        .sort((a, b) => a.fund_identifier.localeCompare(b.fund_identifier))
        .map((f) => ({
          label: `${f.fund_identifier} (${f.name})`,
          value: f.id,
        })),
    ];
  },

  /**
   * Transform selected procedures into a UI summary
   */
  toSelectionSummary(procedures: Procedure[]) {
    const count = procedures.length;
    const totalAmount = procedures.reduce((sum, p) => sum + (p.procedure_amount || 0), 0);

    return {
      count,
      isEmpty: count === 0,
      totalFormatted: new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(totalAmount / 1000),
    };
  },
};
