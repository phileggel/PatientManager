import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FundGroupCandidate } from "@/bindings";
import { Button } from "@/ui/components";
import { useSelectFundGroupsPanel } from "./useSelectFundGroupsPanel";

interface SelectFundGroupsPanelProps {
  transferDate: string;
  selectedGroupIds: string[];
  onSelectionChange: (groupIds: string[], totalAmountMillis: number) => void;
  /** Currently linked groups (BankPayed) shown pre-selected in edit mode. */
  currentGroups?: FundGroupCandidate[];
}

export function SelectFundGroupsPanel(props: SelectFundGroupsPanelProps) {
  const { transferDate, selectedGroupIds, currentGroups } = props;
  const { t } = useTranslation("bank");
  const {
    loading,
    isExpanded,
    fundFilter,
    setFundFilter,
    filteredCandidates,
    getFundName,
    toggleGroup,
    handleExpand,
  } = useSelectFundGroupsPanel(props);

  if (!transferDate) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-neutral-90">{t("transfer.selectGroups.label")}</p>

      {/* Current groups section — shown in edit mode */}
      {currentGroups && currentGroups.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-neutral-60 uppercase tracking-wide">
            {t("transfer.selectGroups.current")}
          </p>
          <div className="bg-m3-surface-container-low rounded-xl flex flex-col">
            {currentGroups.map((group) => (
              <label
                key={group.group_id}
                className="flex items-center gap-3 px-3 py-3 hover:bg-neutral-10 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(group.group_id)}
                  onChange={() => toggleGroup(group)}
                  className="w-4 h-4 shrink-0"
                />
                <div className="flex flex-1 items-center justify-between gap-2 text-sm min-w-0">
                  <span className="font-medium text-neutral-90 truncate">
                    {getFundName(group.fund_id)}
                  </span>
                  <span className="text-neutral-60 text-xs whitespace-nowrap">
                    {new Date(group.payment_date).toLocaleDateString("fr-FR")}
                  </span>
                  <span className="font-semibold whitespace-nowrap">
                    €{(group.total_amount / 1000).toFixed(2)}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* R12 — fund filter input, shown only in expanded mode */}
      {isExpanded && (
        <input
          type="text"
          value={fundFilter}
          onChange={(e) => setFundFilter(e.target.value)}
          placeholder={t("transfer.selectGroups.filterPlaceholder")}
          className="w-full px-3 py-2 text-sm border border-neutral-30 rounded-lg focus:outline-none focus:ring-2 focus:ring-m3-primary"
        />
      )}

      {loading ? (
        <p className="text-sm text-neutral-60 py-2">{t("transfer.selectGroups.loading")}</p>
      ) : filteredCandidates.length === 0 ? (
        <p className="text-sm text-neutral-60 py-2">
          {isExpanded ? t("transfer.selectGroups.emptyAll") : t("transfer.selectGroups.empty")}
        </p>
      ) : (
        <div className="bg-m3-surface-container-low rounded-xl flex flex-col max-h-48 overflow-y-auto">
          {filteredCandidates.map((group) => (
            <label
              key={group.group_id}
              className="flex items-center gap-3 px-3 py-3 hover:bg-neutral-10 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedGroupIds.includes(group.group_id)}
                onChange={() => toggleGroup(group)}
                className="w-4 h-4 shrink-0"
              />
              <div className="flex flex-1 items-center justify-between gap-2 text-sm min-w-0">
                <span className="font-medium text-neutral-90 truncate">
                  {getFundName(group.fund_id)}
                </span>
                <span className="text-neutral-60 text-xs whitespace-nowrap">
                  {new Date(group.payment_date).toLocaleDateString("fr-FR")}
                </span>
                <span className="font-semibold whitespace-nowrap">
                  €{(group.total_amount / 1000).toFixed(2)}
                </span>
              </div>
            </label>
          ))}
        </div>
      )}

      {!isExpanded && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExpand}
          icon={<Search size={14} />}
        >
          {t("transfer.selectGroups.expand")}
        </Button>
      )}

      {selectedGroupIds.length > 0 && (
        <p className="text-xs text-neutral-60">
          {t("transfer.selectGroups.selected", { count: selectedGroupIds.length })}
        </p>
      )}
    </div>
  );
}
