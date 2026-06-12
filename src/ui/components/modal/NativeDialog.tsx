import { type ReactNode, useCallback, useEffect } from "react";

let openDialogCount = 0;

interface NativeDialogProps {
  /** Stable id forwarded to the dialog root; F25. */
  id: string;
  onClose: () => void;
  /** Blocks Escape and backdrop-click dismissal. */
  disableClose?: boolean;
  /** Panel styling applied to the <dialog> element itself. */
  className: string;
  "aria-labelledby"?: string;
  children: ReactNode;
}

/**
 * Shared base for all modal primitives (ADR-008): a native `<dialog>` opened
 * via `showModal()`. The browser top layer paints above every z-index and
 * stacks nested dialogs by open order, so modal layering carries no z-index
 * at all. The platform also provides the backdrop (`::backdrop`) and inertness
 * of the page behind.
 *
 * Mounted ⇒ open: callers render it only while open (the legacy primitives'
 * `if (!isOpen) return null` contract), so the ref callback promotes the
 * element to the top layer on mount.
 */
export function NativeDialog({
  id,
  onClose,
  disableClose = false,
  className,
  "aria-labelledby": labelledBy,
  children,
}: NativeDialogProps) {
  const ref = useCallback((node: HTMLDialogElement | null) => {
    if (node && !node.open) {
      node.showModal();
    }
  }, []);

  // The top layer makes the page inert but does not stop it from scrolling.
  // Reference-counted: closing a nested dialog must not unlock scrolling
  // while its parent dialog is still open.
  useEffect(() => {
    openDialogCount += 1;
    document.body.style.overflow = "hidden";
    return () => {
      openDialogCount -= 1;
      if (openDialogCount === 0) {
        document.body.style.overflow = "unset";
      }
    };
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop-click dismissal; Escape is handled natively via onCancel
    <dialog
      id={id}
      ref={ref}
      aria-labelledby={labelledBy}
      className={`m-auto bg-transparent p-0 [&::backdrop]:bg-m3-scrim/50 [&::backdrop]:backdrop-blur-[2px] ${className}`}
      onCancel={(e) => {
        // Escape — keep React state authoritative instead of letting the
        // platform close the element out from under the `isOpen` prop.
        e.preventDefault();
        if (!disableClose) {
          onClose();
        }
      }}
      onClick={(e) => {
        // A click on ::backdrop targets the <dialog> element itself; clicks
        // inside the panel target descendants.
        if (!disableClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}
