import type { Fund } from "@/bindings";
import type { FundFormData, FundRow } from "./types";

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
