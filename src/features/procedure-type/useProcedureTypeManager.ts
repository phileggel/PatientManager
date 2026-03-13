import { useAppStore } from "@/lib/appStore";

/**
 * Hook for ProcedureTypeManager component
 * - Reads procedure type count from store for display
 */
export function useProcedureTypeManager() {
  const procedureTypes = useAppStore((state) => state.procedureTypes);

  return {
    count: procedureTypes.length,
  };
}
