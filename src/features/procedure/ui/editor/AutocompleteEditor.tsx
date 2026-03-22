import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";

import { type KeyboardEvent, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import { KEYS } from "@/types/keyboard";

// --- Style Configuration ---
// Extracted to keep the JSX clean and maintainable
const STYLES = {
  container: "w-full h-full flex items-center relative",
  input: "w-full h-full bg-transparent outline-none px-2",
  inputError:
    "bg-m3-error-container text-m3-on-error-container placeholder-m3-on-error-container/50 ring-1 ring-inset ring-m3-error focus:ring-m3-error",
  options: "z-[9999] bg-m3-surface shadow-elevation-3 rounded-xl py-1",
  option:
    "px-4 py-2 cursor-pointer text-sm text-m3-on-surface data-[focus]:bg-m3-primary data-[focus]:text-m3-on-primary",
  createOption:
    "px-4 py-2 cursor-pointer text-m3-primary data-[focus]:bg-m3-primary/10 text-sm font-medium",
};

const CREATE_NEW_MARKER = "@@app/CREATE_NEW_ITEM";

export interface AutocompleteEditorProps<T extends object> {
  query: string;
  initialQuery: string;
  items: T[];
  displayKey: keyof T;
  onQueryChange: (val: string) => void;
  onSelect: (item: T) => void;
  onCreateNew?: (query: string) => void;
  onCommit: () => void;
  onCancel: (original: string) => void;
  placeholder?: string;
  idKey?: keyof T;
  isInvalid?: boolean;
}

export function AutocompleteEditor<T extends object>({
  query,
  initialQuery,
  items,
  displayKey,
  onQueryChange,
  onSelect,
  onCreateNew,
  onCommit,
  onCancel,
  placeholder = "",
  idKey = "id" as keyof T,
  isInvalid = false,
}: AutocompleteEditorProps<T>) {
  const { t } = useTranslation("procedure");
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelecting = useRef(false);

  // Determine if the dropdown should be rendered
  const isListOpen = query.length >= 2 && (items.length > 0 || !!onCreateNew);

  // Sync focus and text selection on mount (Consistant with other editors)
  useEffect(() => {
    const focusAndSelect = () => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    };

    requestAnimationFrame(focusAndSelect);
  }, []);

  /**
   * Balanced Keyboard Handling:
   * Only traps arrows if the suggestion list is open.
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === KEYS.ESCAPE) {
      e.preventDefault();
      onCancel(initialQuery);
      return;
    }

    if (!isListOpen) {
      // Grid navigation mode
      if (e.key === KEYS.ARROW_UP || e.key === KEYS.ARROW_DOWN) return;

      // Tab aborts if no list is active
      if (e.key === KEYS.TAB) {
        e.preventDefault();
        onCancel(initialQuery);
        return;
      }
    } else {
      // List navigation mode: stop propagation to protect grid focus
      if (e.key === KEYS.ARROW_UP || e.key === KEYS.ARROW_DOWN) {
        e.stopPropagation();
        return;
      }
    }
  };

  const handleSelection = (value: T | typeof CREATE_NEW_MARKER | null) => {
    logger.debug("WorkCell: handle change.");

    if (!value) return;

    isSelecting.current = true;

    if (value === CREATE_NEW_MARKER) {
      onCreateNew?.(query);
    } else if (typeof value !== "string") {
      onSelect(value);
    }
  };

  const handleClose = () => {
    logger.debug("WorkCell: closing the cell.");
    if (isSelecting.current) return;

    onCommit();
  };

  // Combine base input styles with error styles if needed
  const inputClassName = `${STYLES.input} ${isInvalid ? STYLES.inputError : ""}`;

  return (
    <Combobox
      as="div"
      value={null}
      onChange={handleSelection}
      onClose={handleClose}
      className={STYLES.container}
    >
      <ComboboxInput
        ref={inputRef}
        className={inputClassName}
        displayValue={() => query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />

      {isListOpen && (
        <ComboboxOptions anchor={{ to: "bottom start", gap: "4px" }} className={STYLES.options}>
          {/* Main suggestions */}
          {items.slice(0, 5).map((item) => (
            <ComboboxOption key={String(item[idKey])} value={item} className={STYLES.option}>
              {String(item[displayKey])}
            </ComboboxOption>
          ))}

          {/* Creation marker */}
          {onCreateNew && (
            <ComboboxOption
              key={CREATE_NEW_MARKER}
              value={CREATE_NEW_MARKER}
              className={STYLES.createOption}
            >
              {t("editor.createOption", { query })}
            </ComboboxOption>
          )}
        </ComboboxOptions>
      )}
    </Combobox>
  );
}
