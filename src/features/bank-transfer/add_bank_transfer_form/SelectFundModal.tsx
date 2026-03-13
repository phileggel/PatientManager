import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AffiliatedFund } from "@/bindings";
import { logger } from "@/lib/logger";
import { SelectionModal } from "@/ui/components";
import { useSelectFundModal } from "./useSelectFundModal";

const TAG = "[SelectFundModal]";

interface SelectFundModalProps {
  isOpen: boolean;
  onSelect: (fund: AffiliatedFund) => void;
  onCancel: () => void;
}

export function SelectFundModal({ isOpen, onSelect, onCancel }: SelectFundModalProps) {
  const { t } = useTranslation("bank");
  const { funds, filteredFunds, searchTerm, setSearchTerm } = useSelectFundModal();

  useEffect(() => {
    logger.info(TAG, "Component mounted");
  }, []);

  return (
    <SelectionModal
      isOpen={isOpen}
      onClose={onCancel}
      title={t("transfer.selectFundModal.title")}
      maxWidth="max-w-2xl"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder={t("transfer.selectFundModal.searchPlaceholder")}
    >
      {filteredFunds.length === 0 ? (
        <p className="text-sm text-m3-on-surface-variant py-4 text-center">
          {funds.length === 0
            ? t("transfer.selectFundModal.empty")
            : t("transfer.selectFundModal.noMatch")}
        </p>
      ) : (
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-m3-surface-container">
            <tr className="border-b border-m3-outline">
              <th className="px-4 py-2 text-left text-sm font-semibold text-m3-on-surface">
                {t("transfer.selectFundModal.columns.name")}
              </th>
              <th className="px-4 py-2 text-left text-sm font-semibold text-m3-on-surface">
                {t("transfer.selectFundModal.columns.identifier")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredFunds.map((fund) => (
              <tr
                key={fund.id}
                onClick={() => onSelect(fund)}
                className="border-b border-m3-outline hover:bg-m3-surface-variant cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 text-sm text-m3-on-surface">{fund.name}</td>
                <td className="px-4 py-3 text-sm text-m3-on-surface-variant">
                  {fund.fund_identifier}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SelectionModal>
  );
}
