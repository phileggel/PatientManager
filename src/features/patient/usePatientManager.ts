import { useAppStore } from "@/lib/appStore";

/**
 * Hook for PatientsManager component
 * - Reads patient count from store for display
 */
export function usePatientManager() {
  const patients = useAppStore((state) => state.patients);

  return {
    count: patients.length,
  };
}
