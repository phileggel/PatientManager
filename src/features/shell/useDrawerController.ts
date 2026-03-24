import { useCallback, useState } from "react";

interface DrawerControllerState {
  isExpanded: boolean;
  toggle: () => void;
}

/**
 * Custom hook to manage the persistent navigation sidebar state.
 *
 * Controls the expanded/collapsed (rail) state of the drawer sidebar.
 *
 * @returns {DrawerControllerState} Object with expanded state and toggle function
 *
 * @example
 * const { isExpanded, toggle } = useDrawerController();
 * return (
 *   <Drawer isExpanded={isExpanded} onToggle={toggle} />
 * );
 */
export function useDrawerController(): DrawerControllerState {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  return { isExpanded, toggle };
}
