import { X } from "lucide-react";
import type React from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../field";
import { NativeDialog } from "./NativeDialog";

interface SelectionModalProps {
  /** Stable id forwarded to the dialog root; F25. */
  id: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function SelectionModal({
  id,
  isOpen,
  onClose,
  title,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  children,
  maxWidth = "max-w-2xl",
}: SelectionModalProps) {
  const { t } = useTranslation("common");
  const titleId = useId();

  if (!isOpen) return null;

  return (
    <NativeDialog
      id={id}
      onClose={onClose}
      aria-labelledby={titleId}
      className={`w-full ${maxWidth} max-h-[80vh] bg-m3-surface-container rounded-2xl shadow-xl flex-col overflow-hidden animate-in fade-in zoom-in duration-200 open:flex`}
    >
      {/* Header - Fixed */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-m3-outline/10 flex-shrink-0">
        <h3 id={titleId} className="text-xl font-medium text-m3-on-surface">
          {title}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("action.close")}
          className="p-2 hover:bg-m3-on-surface/5 rounded-full text-m3-on-surface-variant transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Search Field - Fixed */}
      <div className="px-6 py-3 border-b border-m3-outline/10 flex-shrink-0">
        <TextField
          id={`${id}-search`}
          label={t("action.search")}
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder ?? t("action.search")}
        />
      </div>

      {/* Content - Scrollable */}
      <div className="overflow-y-auto flex-1 custom-scrollbar">{children}</div>
    </NativeDialog>
  );
}
