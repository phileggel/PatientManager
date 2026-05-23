import { useCacheStore } from "@/infra/cache/store";

/**
 * Hook for PatientsManager component
 * - Reads patient count from store for display
 */
export function usePatientManager() {
  const patients = useCacheStore((state) => state.patients);

  return {
    count: patients.length,
  };
}
