import { useEffect } from "react";

interface ModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: "max-w-md" | "max-w-2xl" | "max-w-3xl" | "max-w-4xl";
  maxHeight?: "max-h-[80vh]" | "max-h-[90vh]";
}

/**
 * ModalContainer: Base modal wrapper with consistent overlay and close handling
 *
 * This is the foundation for all modal patterns. It provides:
 * - Fixed overlay with centered positioning
 * - Consistent backdrop styling
 * - Body scroll prevention
 * - Escape key handling
 *
 * Use this for simple modals or as a wrapper for more complex patterns.
 */
export function ModalContainer({
  isOpen,
  onClose,
  children,
  maxWidth = "max-w-md",
  maxHeight = "max-h-[90vh]",
}: ModalContainerProps) {
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleEscapeKey);
    }

    return () => {
      document.body.style.overflow = "unset";
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      className="fixed inset-0 z-50 w-full h-full bg-m3-on-surface/40 backdrop-blur-[2px] flex items-center justify-center border-none outline-none cursor-default"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-m3-surface-container-lowest/85 backdrop-blur-[12px] rounded-[28px] shadow-elevation-4 w-full ${maxWidth} ${maxHeight} overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </button>
  );
}
