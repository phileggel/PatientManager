import { X } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { TextField } from "../field";

interface SelectionModalProps {
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
  isOpen,
  onClose,
  title,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  children,
  maxWidth = "max-w-2xl",
}: SelectionModalProps) {
  const { t } = useTranslation("common");
  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 w-full h-full bg-m3-on-surface/40 backdrop-blur-[2px] transition-opacity cursor-default border-none outline-none"
        onClick={onClose}
      />

      {/* Modal Surface */}
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${maxWidth} max-h-[80vh] bg-m3-surface-container rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-m3-outline/10 flex-shrink-0">
          <h3 className="text-xl font-medium text-m3-on-surface">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-m3-on-surface/5 rounded-full text-m3-on-surface-variant transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Field - Fixed */}
        <div className="px-6 py-3 border-b border-m3-outline/10 flex-shrink-0">
          <TextField
            id="selection-search"
            label={t("action.search")}
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>

        {/* Content - Scrollable */}
        <div className="overflow-y-auto flex-1 custom-scrollbar">{children}</div>
      </div>
    </div>
  );
}
