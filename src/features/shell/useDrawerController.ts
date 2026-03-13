import { useEffect, useState } from "react";

interface DrawerControllerState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Custom hook to manage drawer state and behavior
 *
 * Handles:
 * - Drawer open/close state
 * - Body scroll locking when drawer is open
 *
 * @returns {DrawerControllerState} Object with drawer state and control functions
 *
 * @example
 * const { isOpen, toggle, close } = useDrawerController();
 * return (
 *   <>
 *     <DrawerToggle onClick={toggle} isOpen={isOpen} />
 *     <Drawer isOpen={isOpen} onClose={close} />
 *   </>
 * );
 */
export function useDrawerController(): DrawerControllerState {
  const [isOpen, setIsOpen] = useState(false);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen((prev) => !prev);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return { isOpen, open, close, toggle };
}
