import type { ProcedureType } from "@/bindings";
import type { ProcedureTypeFormData, ProcedureTypeRow } from "./types";

/**
 * ProcedureTypePresenter - UI Projection of ProcedureType Domain Object
 *
 * Transforms the ProcedureType domain model into different UI representations:
 * - toRow: For table display (with sorting/filtering)
 * - toFormData: For form editing (only editable fields)
 *
 * This centralizes field extraction logic and makes transformations reusable
 * across different parts of the application.
 */
export const ProcedureTypePresenter = {
  /**
   * Transform domain ProcedureType to UI row data for table display
   * Extracts display fields and adds UI-specific properties
   */
  toRow(procedureType: ProcedureType): ProcedureTypeRow {
    return {
      rowId: crypto.randomUUID(),
      id: procedureType.id,
      name: procedureType.name,
      // Convert from thousandths (i64) to euros for display
      defaultAmount: (procedureType.default_amount ?? 0) / 1000,
      category: procedureType.category ?? null,
    };
  },

  /**
   * Transform domain ProcedureType to form data for editing
   * Extracts only the fields that users can edit
   * Used for both initial form setup and resetting the form
   */
  toFormData(procedureType: ProcedureType): ProcedureTypeFormData {
    return {
      name: procedureType.name || "",
      defaultAmount: ((procedureType.default_amount ?? 0) / 1000).toString(),
      category: procedureType.category || "",
    };
  },
};
