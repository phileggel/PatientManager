import { useMemo } from "react";
import { useCacheStore } from "@/infra/cache/store";
import { RESERVED_PROCEDURE_TYPE_ID } from "./shared/types";

/**
 * Hook for ProcedureTypeManager component
 * - Reads procedure type count from store, excluding the reserved import-pdf type
 * - When searchTerm is active, count reflects only matching types (R11)
 */
export function useProcedureTypeManager(searchTerm = "") {
  const procedureTypes = useCacheStore((state) => state.procedureTypes);

  const count = useMemo(() => {
    const visible = procedureTypes.filter((pt) => pt.id !== RESERVED_PROCEDURE_TYPE_ID);
    if (!searchTerm) return visible.length;
    const term = searchTerm.toLowerCase();
    return visible.filter(
      (pt) =>
        pt.name.toLowerCase().includes(term) || (pt.category ?? "").toLowerCase().includes(term),
    ).length;
  }, [procedureTypes, searchTerm]);

  return {
    count,
  };
}
