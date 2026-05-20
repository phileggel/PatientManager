import type { Fund, FundPaymentGroup, Procedure } from "@/bindings";
import type { FundDisplayData, FundPaymentRow } from "./types";

/**
 * FundPaymentPresenter - UI Projection of Fund Domain Object
 *
 * Transforms the Fund domain model into UI representations
 * for the fund-payment context, ensuring the UI doesn't directly depend
 * on domain fields and properties.
 *
 * This centralizes field extraction logic and makes transformations reusable
 * across different parts of the application.
 */

export const FundPaymentPresenter = {
  /**
   * Transform domain FundPaymentGroup to UI row data for table display
   * Extracts display fields and adds UI-specific properties.
   * totalAmount is kept in thousandths so callers can route through
   * the locale-aware formatCurrency.
   *
   * `proceduresById` resolves each line's procedure to derive the care-period
   * range (FPM-360). Lines whose procedure is missing from the map are skipped;
   * if no procedure resolves, both range fields are undefined.
   */
  toRow(
    group: FundPaymentGroup,
    funds: Fund[],
    proceduresById: Map<string, Procedure> = new Map(),
  ): FundPaymentRow {
    const fund = funds.find((f) => f.id === group.fund_id);
    const procedureDates: string[] = [];
    for (const line of group.lines) {
      const procedure = proceduresById.get(line.procedure_id);
      if (procedure) procedureDates.push(procedure.procedure_date);
    }
    const procedureStartDate =
      procedureDates.length > 0 ? procedureDates.reduce((a, b) => (a < b ? a : b)) : undefined;
    const procedureEndDate =
      procedureDates.length > 0 ? procedureDates.reduce((a, b) => (a > b ? a : b)) : undefined;
    return {
      rowId: group.id,
      id: group.id,
      fundId: group.fund_id,
      fundName: fund ? `${fund.fund_identifier} - ${fund.name}` : group.fund_id,
      paymentDate: group.payment_date,
      procedureStartDate,
      procedureEndDate,
      totalAmount: group.total_amount,
      procedureCount: group.lines.length,
      isLocked: group.is_locked ?? false,
    };
  },
  /**
   * Transform domain Fund to UI display data
   * Extracts only the fields needed for display in fund-payment UI
   * Used to show fund info in modals and panels
   */
  toDisplayData(fund: Fund | undefined): FundDisplayData | null {
    if (!fund) return null;

    return {
      fundIdentifier: fund.fund_identifier,
      fundName: fund.name,
    };
  },

  /**
   * Transform array of Fund to selector options
   * Used for dropdowns and selection lists
   */
  toSelectorOptions(
    funds: Fund[],
    placeholderLabel: string,
  ): Array<{ label: string; value: string }> {
    return [
      { label: placeholderLabel, value: "" },
      ...funds
        .toSorted((a, b) => a.fund_identifier.localeCompare(b.fund_identifier))
        .map((f) => ({
          label: `${f.fund_identifier} (${f.name})`,
          value: f.id,
        })),
    ];
  },

  /**
   * Transform selected procedures into a UI summary.
   * `totalAmount` is in thousandths; consumers format it via the
   * locale-aware `useFormatters().formatCurrency`.
   */
  toSelectionSummary(procedures: Procedure[]) {
    const count = procedures.length;
    const totalAmount = procedures.reduce((sum, p) => sum + (p.billed_amount || 0), 0);

    return {
      count,
      isEmpty: count === 0,
      totalAmount,
    };
  },
};
