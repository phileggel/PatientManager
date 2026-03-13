import type { Patient } from "@/bindings";
import { useFuzzySearch } from "@/lib/useFuzzySearch";
import { AutocompleteEditor, type AutocompleteEditorProps } from "./AutocompleteEditor";

// src/features/procedures/ui/PatientAutocompleteEditor.tsx
export function PatientAutocompleteEditor({
  allData,
  ...props
}: Omit<AutocompleteEditorProps<Patient>, "items" | "displayKey"> & { allData: Patient[] }) {
  const filtered = useFuzzySearch(props.query, allData, ["name"]);

  return (
    <AutocompleteEditor
      {...props}
      items={filtered}
      displayKey="name" // Visual display matches the search key
      idKey="id" // Technical identifier
      placeholder="Nom du patient..."
    />
  );
}
