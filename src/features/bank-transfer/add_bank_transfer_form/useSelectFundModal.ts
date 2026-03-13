import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/appStore";

export function useSelectFundModal() {
  const funds = useAppStore((state) => state.funds);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredFunds = useMemo(() => {
    if (!searchTerm.trim()) return funds;
    const lower = searchTerm.toLowerCase();
    return funds.filter(
      (fund) =>
        fund.name.toLowerCase().includes(lower) ||
        fund.fund_identifier.toLowerCase().includes(lower),
    );
  }, [funds, searchTerm]);

  return {
    funds,
    filteredFunds,
    searchTerm,
    setSearchTerm,
  };
}
