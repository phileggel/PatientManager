import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FundGroupCandidate } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { Button } from "@/ui/components";
import { getAllUnsettledFundGroups, getUnsettledFundGroups } from "./gateway";

interface SelectFundGroupsPanelProps {
  transferDate: string;
  selectedGroupIds: string[];
  onSelectionChange: (groupIds: string[], totalAmountMillis: number) => void;
}

export function SelectFundGroupsPanel({
  transferDate,
  selectedGroupIds,
  onSelectionChange,
}: SelectFundGroupsPanelProps) {
  const { t } = useTranslation("bank");
  const funds = useAppStore((state) => state.funds);

  const [candidates, setCandidates] = useState<FundGroupCandidate[]>([]);
  // Accumulates all ever-fetched candidates to compute totals for any selected id
  const candidateMapRef = useRef<Map<string, FundGroupCandidate>>(new Map());
  const [loading, setLoading] = useState(false);
  // Track which date has been "expanded" — resets automatically when transferDate changes
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Refs to avoid stale closures in the fetch effect
  const selectedGroupIdsRef = useRef(selectedGroupIds);
  selectedGroupIdsRef.current = selectedGroupIds;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const getFundName = (fundId: string): string =>
    funds.find((f) => f.id === fundId)?.name ?? fundId;

  useEffect(() => {
    if (!transferDate) {
      setCandidates([]);
      return;
    }

    const isExpanded = expandedDate === transferDate;
    setLoading(true);
    const promise = isExpanded ? getAllUnsettledFundGroups() : getUnsettledFundGroups(transferDate);

    promise
      .then((result) => {
        if (result.success && result.data) {
          for (const c of result.data) candidateMapRef.current.set(c.group_id, c);
          setCandidates(result.data);
          // Recompute total for current selection now that amounts are available
          const ids = selectedGroupIdsRef.current;
          if (ids.length > 0) {
            const total = ids.reduce(
              (sum, id) => sum + (candidateMapRef.current.get(id)?.total_amount ?? 0),
              0,
            );
            onSelectionChangeRef.current(ids, total);
          }
        } else {
          logger.error("[SelectFundGroupsPanel] fetch failed", { error: result.error });
          setCandidates([]);
        }
      })
      .finally(() => setLoading(false));
  }, [transferDate, expandedDate]);

  const toggleGroup = (group: FundGroupCandidate) => {
    candidateMapRef.current.set(group.group_id, group);
    const newIds = selectedGroupIds.includes(group.group_id)
      ? selectedGroupIds.filter((id) => id !== group.group_id)
      : [...selectedGroupIds, group.group_id];
    const total = newIds.reduce(
      (sum, id) => sum + (candidateMapRef.current.get(id)?.total_amount ?? 0),
      0,
    );
    onSelectionChange(newIds, total);
  };

  if (!transferDate) return null;

  const isExpanded = expandedDate === transferDate;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-neutral-90">{t("transfer.selectGroups.label")}</p>

      {loading ? (
        <p className="text-sm text-neutral-60 py-2">{t("transfer.selectGroups.loading")}</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-neutral-60 py-2">
          {isExpanded ? t("transfer.selectGroups.emptyAll") : t("transfer.selectGroups.empty")}
        </p>
      ) : (
        <div className="border border-neutral-30 rounded-lg divide-y divide-neutral-20 max-h-48 overflow-y-auto">
          {candidates.map((group) => (
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
                  {group.payment_date}
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
          onClick={() => setExpandedDate(transferDate)}
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
