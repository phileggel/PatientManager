import { useMemo, useState } from "react";
import { useFuzzySearch } from "@/lib/useFuzzySearch";

/**
 * useComboboxField - Logic for the generic ComboboxField component.
 *
 * Manages the text query, fuzzy-filtered suggestions, and resolves the
 * display label from the currently selected id.
 */
export function useComboboxField<T extends object>(
  items: T[],
  displayKey: keyof T,
  idKey: keyof T,
  selectedId: string,
  searchKeys?: (keyof T)[],
) {
  const [query, setQuery] = useState("");

  const keys = searchKeys ? searchKeys.map(String) : [String(displayKey)];
  const filteredItems = useFuzzySearch(query, items, keys);

  const displayValue = useMemo(() => {
    if (!selectedId) return "";
    const found = items.find((item) => String(item[idKey]) === selectedId);
    return found ? String(found[displayKey]) : "";
  }, [items, idKey, displayKey, selectedId]);

  return { query, setQuery, filteredItems, displayValue };
}
