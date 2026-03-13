import type { ProcedureType } from "@/bindings";
import { useFuzzySearch } from "@/lib/useFuzzySearch";
import { AutocompleteEditor, type AutocompleteEditorProps } from "./AutocompleteEditor";

// src/features/procedures/ui/ProcedureTypeAutocompleteEditor.tsx
export function ProcedureTypeAutocompleteEditor({
  allData,
  ...props
}: Omit<AutocompleteEditorProps<ProcedureType>, "items" | "displayKey"> & {
  allData: ProcedureType[];
}) {
  const filtered = useFuzzySearch(props.query, allData, ["name"]);

  return (
    <AutocompleteEditor
      {...props}
      items={filtered}
      displayKey="name"
      idKey="id"
      placeholder="Type d'acte..."
    />
  );
}
