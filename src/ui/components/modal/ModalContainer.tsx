import type { ReactNode } from "react";
import { NativeDialog } from "./NativeDialog";

interface ModalContainerProps {
  /** Stable id forwarded to the dialog root; F25 — `{feature}-{component}-modal`. */
  id: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: "max-w-md" | "max-w-2xl" | "max-w-3xl" | "max-w-4xl";
  maxHeight?: "max-h-[80vh]" | "max-h-[90vh]";
  titleId?: string;
}

/**
 * ModalContainer: Base modal wrapper with consistent overlay and close handling
 *
 * This is the foundation for all modal patterns. It provides:
 * - Native `<dialog>` top-layer rendering (ADR-008)
 * - Consistent backdrop styling
 * - Body scroll prevention
 * - Escape key handling
 *
 * Use this for simple modals or as a wrapper for more complex patterns.
 */
export function ModalContainer({
  id,
  isOpen,
  onClose,
  children,
  maxWidth = "max-w-md",
  maxHeight = "max-h-[90vh]",
  titleId,
}: ModalContainerProps) {
  if (!isOpen) return null;

  return (
    <NativeDialog
      id={id}
      onClose={onClose}
      aria-labelledby={titleId}
      className={`bg-m3-surface-container-lowest/85 backdrop-blur-[12px] rounded-[28px] shadow-elevation-4 w-full ${maxWidth} ${maxHeight} overflow-hidden flex-col open:flex`}
    >
      {children}
    </NativeDialog>
  );
}
