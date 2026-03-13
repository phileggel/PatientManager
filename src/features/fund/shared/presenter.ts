import type { AffiliatedFund } from "@/bindings";
import type { FundFormData, FundRow } from "./types";

/**
 * FundPresenter - UI Projection of AffiliatedFund Domain Object
 *
 * Transforms the AffiliatedFund domain model into different UI representations:
 * - toRow: For table display (with sorting/filtering)
 * - toFormData: For form editing (only editable fields)
 *
 * This centralizes field extraction logic and makes transformations reusable
 * across different parts of the application.
 */
export const FundPresenter = {
  /**
   * Transform domain AffiliatedFund to UI row data for table display
   * Extracts display fields and adds UI-specific properties
   */
  toRow(fund: AffiliatedFund): FundRow {
    return {
      rowId: crypto.randomUUID(),
      fundIdentifier: fund.fund_identifier,
      fundName: fund.name,
      id: fund.id,
    };
  },

  /**
   * Transform domain AffiliatedFund to form data for editing
   * Extracts only the fields that users can edit
   * Used for both initial form setup and resetting the form
   */
  toFormData(fund: AffiliatedFund): FundFormData {
    return {
      fund_identifier: fund.fund_identifier,
      name: fund.name,
    };
  },
};
