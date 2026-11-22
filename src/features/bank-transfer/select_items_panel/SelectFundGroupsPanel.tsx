import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FundGroupCandidate } from "@/bindings";
import { Button } from "@/ui/components";
import { useFormatters } from "@/ui/format/formatters";
import { useSelectFundGroupsPanel } from "./useSelectFundGroupsPanel";

interface SelectFundGroupsPanelProps {
  transferDate: string;
  selectedGroupIds: string[];
  onSelectionChange: (groupIds: string[], totalAmountMillis: number) => void;
  /** Currently linked groups (BankPayed) shown pre-selected in edit mode. */
  currentGroups?: FundGroupCandidate[];
}

export function SelectFundGroupsPanel(props: SelectFundGroupsPanelProps) {
  const { selectedGroupIds, currentGroups } = props;
  const { t } = useTranslation("bank");
  const { formatCurrency, formatDate } = useFormatters();
  const {
    loading,
    isExpanded,
    fundFilter,
    setFundFilter,
    filteredCandidates,
    getFundName,
    toggleGroup,
    handleExpand,
    needsDate,
  } = useSelectFundGroupsPanel(props);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-m3-on-surface">{t("transfer.select_groups.label")}</p>

      {/* Current groups section — shown in edit mode */}
      {currentGroups && currentGroups.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-m3-on-surface-variant uppercase tracking-wide">
            {t("transfer.select_groups.current")}
          </p>
          <div className="bg-m3-surface-container-low rounded-xl flex flex-col">
            {currentGroups.map((group) => (
              <label
                key={group.group_id}
                className="flex items-center gap-3 px-3 py-3 hover:bg-m3-surface-container-high cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(group.group_id)}
                  onChange={() => toggleGroup(group)}
                  className="w-4 h-4 shrink-0"
                />
                <div className="flex flex-1 items-center justify-between gap-2 text-sm min-w-0">
                  <span className="font-medium text-m3-on-surface truncate">
                    {getFundName(group.fund_id)}
                  </span>
                  <span className="text-m3-on-surface-variant text-xs whitespace-nowrap">
                    {formatDate(group.payment_date)}
                  </span>
                  <span className="font-semibold whitespace-nowrap text-m3-on-surface">
                    {formatCurrency(group.total_amount)}
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
          placeholder={t("transfer.select_groups.filter_placeholder")}
          className="w-full px-3 py-2 text-sm border border-m3-outline/40 rounded-lg bg-transparent text-m3-on-surface focus:outline-none focus:ring-2 focus:ring-m3-primary"
        />
      )}

      {needsDate ? (
        <p
          id="bank-transfer-group-candidate-no-date"
          className="text-sm text-m3-on-surface-variant py-2"
        >
          {t("transfer.select_groups.no_date")}
        </p>
      ) : loading ? (
        <p className="text-sm text-m3-on-surface-variant py-2">
          {t("transfer.select_groups.loading")}
        </p>
      ) : filteredCandidates.length === 0 ? (
        <p className="text-sm text-m3-on-surface-variant py-2">
          {isExpanded ? t("transfer.select_groups.empty_all") : t("transfer.select_groups.empty")}
        </p>
      ) : (
        <div className="bg-m3-surface-container-low rounded-xl flex flex-col max-h-48 overflow-y-auto">
          {filteredCandidates.map((group) => (
            <label
              key={group.group_id}
              className="flex items-center gap-3 px-3 py-3 hover:bg-m3-surface-container-high cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={selectedGroupIds.includes(group.group_id)}
                onChange={() => toggleGroup(group)}
                className="w-4 h-4 shrink-0"
              />
              <div className="flex flex-1 items-center justify-between gap-2 text-sm min-w-0">
                <span className="font-medium text-m3-on-surface truncate">
                  {getFundName(group.fund_id)}
                </span>
                <span className="text-m3-on-surface-variant text-xs whitespace-nowrap">
                  {formatDate(group.payment_date)}
                </span>
                <span className="font-semibold whitespace-nowrap text-m3-on-surface">
                  {formatCurrency(group.total_amount)}
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
          {t("transfer.select_groups.expand")}
        </Button>
      )}
    </div>
  );
}
