import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { useMemo } from "react";
import { useComboboxField } from "./useComboboxField";

interface ComboboxFieldProps<T extends object> {
  id: string;
  label: string;
  items: T[];
  displayKey: keyof T;
  idKey: keyof T;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  searchKeys?: (keyof T)[];
  /**
   * Optional opt-in: items whose `item[priorityKey]` field is truthy are
   * surfaced above items where it is falsy, preserving fuzzy match-score
   * order within each bucket. Use to promote complete items (e.g. patients
   * with an SSN, funds with an identifier) over incomplete ones.
   */
  priorityKey?: keyof T;
  error?: string;
  disabled?: boolean;
  onCreateNew?: (query: string) => void;
  createLabel?: string;
  /** Optional neutral message shown in the dropdown when the search finds nothing. */
  noResultLabel?: (query: string) => string;
}

const CREATE_MARKER = "@@CREATE";
const NO_RESULT_MARKER = "@@NO_RESULT";

/**
 * ComboboxField - M3 Design System Autocomplete + Dropdown field.
 *
 * Generic combobox with fuzzy search, item selection and optional inline
 * "create new" entry. Styling follows the same m3-input / m3-input-label
 * conventions as TextField and SelectField.
 *
 * @example
 * <ComboboxField
 *   id="patient"
 *   label="Patient *"
 *   items={patients}
 *   displayKey="name"
 *   idKey="id"
 *   value={patientId}
 *   onChange={setPatientId}
 *   onCreateNew={(q) => openCreatePatient(q)}
 *   createLabel="+ Create a patient"
 * />
 */
export function ComboboxField<T extends object>({
  id,
  label,
  items,
  displayKey,
  idKey,
  value,
  onChange,
  searchKeys,
  priorityKey,
  placeholder,
  error,
  disabled,
  onCreateNew,
  createLabel,
  noResultLabel,
}: ComboboxFieldProps<T>) {
  const { query, setQuery, filteredItems, isNoResult } = useComboboxField(
    items,
    displayKey,
    idKey,
    value,
    searchKeys,
    priorityKey,
  );

  const selectedItem = useMemo(
    () => items.find((item) => String(item[idKey]) === value) ?? null,
    [items, idKey, value],
  );

  const hasResults = filteredItems.length > 0;
  const showNoResult = isNoResult && !!noResultLabel;
  const showDropdown = query.length >= 2 && (hasResults || !!onCreateNew || showNoResult);

  const handleChange = (selected: T | typeof CREATE_MARKER | typeof NO_RESULT_MARKER | null) => {
    if (!selected || selected === NO_RESULT_MARKER) return;
    if (selected === CREATE_MARKER) {
      onCreateNew?.(query);
    } else {
      onChange(String((selected as T)[idKey]));
      setQuery("");
    }
  };

  const inputClassName = [
    "m3-input w-full",
    error ? "border-m3-error" : "",
    disabled ? "opacity-50 cursor-not-allowed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="m3-input-label">
        {label}
      </label>

      <Combobox disabled={disabled} value={selectedItem} onChange={handleChange}>
        <div className="relative group">
          <ComboboxInput
            id={id}
            className={inputClassName}
            displayValue={(item: T | null) => query || (item ? String(item[displayKey]) : "")}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />

          {showDropdown && (
            <ComboboxOptions
              anchor={{ to: "bottom start", gap: "4px" }}
              className="z-50 w-[var(--input-width)] bg-m3-surface border border-m3-outline/20 shadow-elevation-3 rounded-lg py-1 overflow-auto max-h-48"
            >
              {showNoResult && (
                <ComboboxOption
                  id={`${id}-no-result`}
                  value={NO_RESULT_MARKER}
                  disabled
                  className="px-4 py-2 text-sm italic text-m3-on-surface-variant"
                >
                  {noResultLabel(query)}
                </ComboboxOption>
              )}

              {filteredItems.slice(0, 6).map((item) => (
                <ComboboxOption
                  key={String(item[idKey])}
                  value={item}
                  className="px-4 py-2 text-sm text-m3-on-surface cursor-pointer data-[focus]:bg-m3-primary/10 data-[focus]:text-m3-primary"
                >
                  {String(item[displayKey])}
                </ComboboxOption>
              ))}

              {onCreateNew && (
                <ComboboxOption
                  id={`${id}-create`}
                  value={CREATE_MARKER}
                  className={`px-4 py-2 text-sm font-medium text-m3-primary cursor-pointer data-[focus]:bg-m3-primary/10 ${hasResults || showNoResult ? "border-t border-m3-outline/10" : ""}`}
                >
                  {createLabel}
                </ComboboxOption>
              )}
            </ComboboxOptions>
          )}
        </div>
      </Combobox>

      {error && (
        <p role="alert" className="text-xs text-m3-error mt-1 ml-1">
          {error}
        </p>
      )}
    </div>
  );
}
