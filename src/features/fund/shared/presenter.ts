import type { Fund, FundError } from "@/bindings";
import type { FundFormData, FundRow } from "./types";

/**
 * Layer 3 of the F27 typed-error pipeline: pure code → i18n key mapping for
 * the Fund bounded context. Caller (Layer 4) calls `t(key, params)`.
 */
export function formatFundError(err: FundError): {
  key: string;
  params?: Record<string, string | number>;
} {
  switch (err.code) {
    case "FundIdentifierEmpty":
      return { key: "fund:errors.fund_identifier_empty" };
    case "FundNameEmpty":
      return { key: "fund:errors.fund_name_empty" };
    case "FundIdEmpty":
      return { key: "fund:errors.fund_id_empty" };
    case "TotalAmountNotPositive":
      return { key: "fund:errors.total_amount_not_positive" };
    case "InvalidPaymentDateFormat":
      return { key: "fund:errors.invalid_payment_date_format" };
    case "FundPaymentGroupIdEmpty":
      return { key: "fund:errors.fund_payment_group_id_empty" };
    case "LineProcedureIdEmpty":
      return { key: "fund:errors.line_procedure_id_empty" };
    case "PaymentGroupNotFound":
      return {
        key: "fund:errors.payment_group_not_found",
        params: { id: err.fund_payment_group_id },
      };
    case "DatabaseError":
      return { key: "fund:errors.database_error" };
  }
}

/**
 * FundPresenter - UI Projection of Fund Domain Object
 *
 * Transforms the Fund domain model into different UI representations:
 * - toRow: For table display (with sorting/filtering)
 * - toFormData: For form editing (only editable fields)
 *
 * This centralizes field extraction logic and makes transformations reusable
 * across different parts of the application.
 */
export const FundPresenter = {
  /**
   * Transform domain Fund to UI row data for table display
   * Extracts display fields and adds UI-specific properties
   */
  toRow(fund: Fund): FundRow {
    return {
      rowId: crypto.randomUUID(),
      fundIdentifier: fund.fund_identifier,
      fundName: fund.name,
      id: fund.id,
    };
  },

  /**
   * Transform domain Fund to form data for editing
   * Extracts only the fields that users can edit
   * Used for both initial form setup and resetting the form
   */
  toFormData(fund: Fund): FundFormData {
    return {
      fund_identifier: fund.fund_identifier,
      name: fund.name,
    };
  },
};
