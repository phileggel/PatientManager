import type { AffiliatedFund } from "@/bindings";
import { useFuzzySearch } from "@/lib/useFuzzySearch";
import { AutocompleteEditor, type AutocompleteEditorProps } from "./AutocompleteEditor";

export function FundAutocompleteEditor({
  allData,
  ...props
}: Omit<AutocompleteEditorProps<AffiliatedFund>, "items" | "displayKey"> & {
  allData: AffiliatedFund[];
}) {
  const filtered = useFuzzySearch(props.query, allData, ["fund_identifier"], 0);

  return (
    <AutocompleteEditor
      {...props}
      items={filtered}
      displayKey="fund_identifier"
      idKey="id"
      placeholder="Nom de la caisse..."
    />
  );
}
