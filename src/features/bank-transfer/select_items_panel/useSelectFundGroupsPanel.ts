import { useEffect, useRef, useState } from "react";
import type { FundGroupCandidate } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { getAllUnsettledFundGroups, getUnsettledFundGroups } from "../gateway";

interface UseSelectFundGroupsPanelProps {
  transferDate: string;
  selectedGroupIds: string[];
  onSelectionChange: (groupIds: string[], totalAmountMillis: number) => void;
  currentGroups?: FundGroupCandidate[];
}

export function useSelectFundGroupsPanel({
  transferDate,
  selectedGroupIds,
  onSelectionChange,
  currentGroups,
}: UseSelectFundGroupsPanelProps) {
  const funds = useAppStore((state) => state.funds);

  const [candidates, setCandidates] = useState<FundGroupCandidate[]>([]);
  // Accumulates all ever-fetched candidates to compute totals for any selected id
  const candidateMapRef = useRef<Map<string, FundGroupCandidate>>(new Map());
  const [loading, setLoading] = useState(false);
  // Track which date has been "expanded" — resets automatically when transferDate changes
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  // R12 — fund filter input, only active in expanded mode
  const [fundFilter, setFundFilter] = useState("");

  // Refs to avoid stale closures in the fetch effect
  const selectedGroupIdsRef = useRef(selectedGroupIds);
  selectedGroupIdsRef.current = selectedGroupIds;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    logger.info("[SelectFundGroupsPanel] mounted");
  }, []);

  // Merge current groups into the map so their totals are available for selection computation
  useEffect(() => {
    if (!currentGroups) return;
    for (const g of currentGroups) candidateMapRef.current.set(g.group_id, g);
  }, [currentGroups]);

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

  const isExpanded = expandedDate === transferDate;

  const getFundName = (fundId: string): string =>
    funds.find((f) => f.id === fundId)?.name ?? fundId;

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

  const handleExpand = () => {
    setFundFilter("");
    setExpandedDate(transferDate);
  };

  // Exclude current groups from candidates to avoid duplicate rows
  const currentGroupIds = new Set(currentGroups?.map((g) => g.group_id) ?? []);

  // R12 — when expanded: filter by fund name/identifier and sort by payment_date DESC
  const withoutCurrent = candidates.filter((c) => !currentGroupIds.has(c.group_id));
  const filteredCandidates = isExpanded
    ? withoutCurrent
        .filter((c) => {
          if (!fundFilter.trim()) return true;
          const query = fundFilter.trim().toLowerCase();
          const fund = funds.find((f) => f.id === c.fund_id);
          return (
            fund?.name.toLowerCase().includes(query) ||
            fund?.fund_identifier.toLowerCase().includes(query)
          );
        })
        .sort((a, b) => b.payment_date.localeCompare(a.payment_date))
    : withoutCurrent;

  return {
    loading,
    isExpanded,
    fundFilter,
    setFundFilter,
    filteredCandidates,
    getFundName,
    toggleGroup,
    handleExpand,
  };
}
