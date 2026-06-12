import { X } from "lucide-react";
import type React from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../button";
import { NativeDialog } from "./NativeDialog";

interface DialogProps {
  /** Stable id forwarded to the dialog root; F25 — `{feature}-{component}-dialog`. */
  id: string;
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: string;
  disableClose?: boolean;
}

export function Dialog({
  id,
  isOpen,
  onClose,
  title,
  children,
  actions,
  maxWidth = "max-w-md",
  disableClose = false,
}: DialogProps) {
  const { t } = useTranslation("common");
  const titleId = useId();

  if (!isOpen) return null;

  return (
    <NativeDialog
      id={id}
      onClose={onClose}
      disableClose={disableClose}
      aria-labelledby={titleId}
      className={`w-full ${maxWidth} bg-m3-surface-container-lowest/85 backdrop-blur-md rounded-[28px] shadow-elevation-4 flex-col overflow-hidden animate-in fade-in zoom-in duration-200 open:flex`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <h3 id={titleId} className="text-xl font-medium text-m3-on-surface">
          {title}
        </h3>
        {!disableClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("action.close")}
            className="p-2 hover:bg-m3-on-surface/5 rounded-full text-m3-on-surface-variant transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="px-6 py-2 overflow-y-auto text-m3-on-surface-variant">{children}</div>

      {/* Footer Actions */}
      {actions && (
        <div className="flex items-center justify-end gap-2 px-6 py-4 mt-2">{actions}</div>
      )}
    </NativeDialog>
  );
}

interface ConfirmationDialogProps {
  /** Stable id forwarded to the dialog root; F25. */
  id: string;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: "default" | "danger";
}

export function ConfirmationDialog({
  id,
  isOpen,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "default",
}: ConfirmationDialogProps) {
  const actions = (
    <div className="flex items-center justify-end gap-3">
      <Button variant="ghost" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button
        variant={variant === "danger" ? "danger" : "primary"}
        onClick={() => {
          onConfirm();
          onCancel();
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  );

  return (
    <Dialog id={id} isOpen={isOpen} onClose={onCancel} title={title} actions={actions}>
      <p className="text-m3-on-surface-variant leading-relaxed">{message}</p>
    </Dialog>
  );
}
