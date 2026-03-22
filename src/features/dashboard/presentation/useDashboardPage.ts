import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import { toastService } from "@/core/snackbar";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { fetchDashboardData } from "../api/dashboardService";
import type { DashboardMetrics } from "../types";
import { aggregateDashboardMetrics, getAvailableYears } from "../utils/aggregation";

export interface DashboardPageState {
  allProcedures: Procedure[];
  selectedYear: number | null;
  setSelectedYear: (year: number) => void;
  metrics: DashboardMetrics | null;
  previousYearMetrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
}

export function useDashboardPage(): DashboardPageState {
  const { t } = useTranslation("dashboard");
  const procedureTypes = useAppStore((state) => state.procedureTypes);
  const [allProcedures, setAllProcedures] = useState<Procedure[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load procedure data on mount
  useEffect(() => {
    const loadData = async () => {
      logger.info("Loading dashboard data");
      setLoading(true);

      const result = await fetchDashboardData();

      if (result.success && result.data?.procedures) {
        const procedures = Array.isArray(result.data.procedures) ? result.data.procedures : [];
        setAllProcedures(procedures);

        const years = getAvailableYears(procedures);
        if (years.length > 0 && years[0] !== undefined) {
          setSelectedYear(years[0]);
        }

        setError(null);
      } else {
        setError(result.error || t("loadFailed"));
      }

      setLoading(false);
    };

    loadData();
  }, [t]);

  // Listen for procedure updates and reload dashboard
  useEffect(() => {
    const handleProcedureUpdate = async () => {
      logger.info("Dashboard: Procedure update detected, reloading data");
      const result = await fetchDashboardData();

      if (result.success && result.data?.procedures) {
        const procedures = Array.isArray(result.data.procedures) ? result.data.procedures : [];
        setAllProcedures(procedures);
        setError(null);
      } else {
        logger.error("Dashboard: Failed to reload procedures", { error: result.error });
        toastService.show("error", t("reloadFailed"));
      }
    };

    window.addEventListener("procedure_updated", handleProcedureUpdate);
    return () => window.removeEventListener("procedure_updated", handleProcedureUpdate);
  }, [t]);

  // Recalculate metrics when year changes
  useEffect(() => {
    if (selectedYear && allProcedures.length > 0) {
      const aggregated = aggregateDashboardMetrics(
        allProcedures,
        procedureTypes,
        selectedYear,
        t("uncategorized"),
      );
      setMetrics(aggregated);
    }
  }, [selectedYear, allProcedures, procedureTypes, t]);

  const previousYearMetrics = useMemo(
    () =>
      metrics && selectedYear
        ? aggregateDashboardMetrics(
            allProcedures,
            procedureTypes,
            selectedYear - 1,
            t("uncategorized"),
          )
        : null,
    [metrics, selectedYear, allProcedures, procedureTypes, t],
  );

  return {
    allProcedures,
    selectedYear,
    setSelectedYear,
    metrics,
    previousYearMetrics,
    loading,
    error,
  };
}
