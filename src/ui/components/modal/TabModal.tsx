import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalContainer } from "./ModalContainer";

export interface TabDef {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabModalProps {
  /** Stable id forwarded to the dialog root; F25. */
  id: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  tabs: TabDef[];
  footer?: React.ReactNode;
  maxWidth?: "max-w-3xl" | "max-w-4xl";
}

/**
 * TabModal: Pattern for multi-view tabbed content
 *
 * Use this for:
 * - Reports with multiple views (results, table, raw data)
 * - Wizards or multi-step displays in a single modal
 * - Complex analysis with different data representations
 *
 * Layout:
 * - Fixed header with title (and optional subtitle)
 * - Tab button row with border separator
 * - Scrollable tab content area (each tab independently)
 * - Optional fixed footer for actions
 *
 * Best for:
 * - ReconciliationModal (results + table + raw data tabs)
 * - ParsingReportModal (multiple tab views)
 */
export function TabModal({
  id,
  isOpen,
  onClose,
  title,
  subtitle,
  tabs,
  footer,
  maxWidth = "max-w-4xl",
}: TabModalProps) {
  const { t } = useTranslation("common");
  const titleId = useId();
  const [activeTabId, setActiveTabId] = useState(tabs.length > 0 ? tabs[0]?.id || "" : "");

  // Reset active tab when tabs change (e.g., loading → content tabs)
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0]?.id || "");
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <ModalContainer
      id={id}
      isOpen={isOpen}
      onClose={onClose}
      maxWidth={maxWidth}
      maxHeight="max-h-[80vh]"
      titleId={titleId}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-neutral-30">
        <div className="flex-1">
          <h2 id={titleId} className="text-lg font-semibold text-neutral-90">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-neutral-60 mt-1">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("action.close")}
          className="p-1 hover:bg-neutral-20 rounded transition-colors flex-shrink-0 ml-4"
        >
          <X size={20} className="text-neutral-70" />
        </button>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-0 border-b border-neutral-30 px-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTabId(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTabId === tab.id
                ? "border-primary-60 text-primary-60"
                : "border-transparent text-neutral-70 hover:text-neutral-90"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-6">{activeTab?.content}</div>

      {/* Footer (Optional) */}
      {footer && <div className="border-t border-neutral-30 bg-neutral-5 p-4">{footer}</div>}
    </ModalContainer>
  );
}
