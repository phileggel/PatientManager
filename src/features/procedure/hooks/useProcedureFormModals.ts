import { useCallback, useState } from "react";

/**
 * Types alignés sur les entités de la WorkflowTable
 */
export type EntityModalType = "PATIENT" | "FUND" | "PROCEDURE_TYPE";

interface ActiveModal {
  type: EntityModalType;
  query: string;
}

export type ProcedureFormModals = ReturnType<typeof useProcedureFormModals>;

/**
 * useProcedureFormModals
 * * Manages a single active modal state for creation-on-the-fly.
 * Integrated with the WorkflowTable's focus and query system.
 */
export function useProcedureFormModals() {
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);

  /**
   * Opens the requested modal with the current search query from the table
   */
  const openModal = useCallback((type: EntityModalType, query: string) => {
    setActiveModal({ type, query });
  }, []);

  /**
   * Closes any active modal and resets the state
   */
  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  return {
    // Current state
    activeModal,

    // Commands
    openModal,
    closeModal,

    // Computed booleans for cleaner JSX (Avoids ternary hell in the render)
    isPatientModalOpen: activeModal?.type === "PATIENT",
    isFundModalOpen: activeModal?.type === "FUND",
    isProcedureModalOpen: activeModal?.type === "PROCEDURE_TYPE",

    // Current query helper
    currentQuery: activeModal?.query || "",
  };
}
