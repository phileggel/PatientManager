import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Procedure } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { logger } from "@/lib/logger";
import { fetchDashboardData } from "../api/dashboardService";
import { MonthCategoryTable } from "../components/MonthCategoryTable";
import type { DashboardMetrics } from "../types";
import { aggregateDashboardMetrics, getAvailableYears } from "../utils/aggregation";

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const procedureTypes = useAppStore((state) => state.procedureTypes);
  const [allProcedures, setAllProcedures] = useState<Procedure[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    logger.info("[DashboardPage] Component mounted");
  }, []);

  // Load procedure data on mount
  useEffect(() => {
    const loadData = async () => {
      logger.info("Loading dashboard data");
      setLoading(true);

      const result = await fetchDashboardData();

      if (result.success && result.data?.procedures) {
        const procedures = Array.isArray(result.data.procedures) ? result.data.procedures : [];
        setAllProcedures(procedures);

        // Auto-select the most recent year
        const years = getAvailableYears(procedures);
        if (years.length > 0 && years[0] !== undefined) {
          setSelectedYear(years[0]); // Most recent year
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
      }
    };

    window.addEventListener("procedure_updated", handleProcedureUpdate);
    return () => window.removeEventListener("procedure_updated", handleProcedureUpdate);
  }, []);

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

  // Get previous year metrics for comparison
  const previousYearMetrics =
    metrics && selectedYear
      ? aggregateDashboardMetrics(
          allProcedures,
          procedureTypes,
          selectedYear - 1,
          t("uncategorized"),
        )
      : null;

  if (loading) {
    return (
      <div className="h-full bg-m3-surface p-12 flex items-center justify-center">
        <div className="text-m3-on-surface-variant animate-pulse">{t("loading")}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full bg-m3-surface p-12 flex items-center justify-center">
        <div className="rounded-xl bg-m3-error-container p-6 text-m3-on-error-container">
          <h2 className="text-lg font-semibold mb-2">{t("error")}</h2>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Show info message when there's no data
  if (allProcedures.length === 0) {
    return (
      <div className="h-full bg-m3-surface p-12 flex items-start justify-center pt-56">
        <div className="max-w-md rounded-xl bg-m3-primary-container/20 p-8">
          <h2 className="text-sm font-semibold text-m3-primary mb-3">{t("welcome.title")}</h2>
          <p className="text-sm text-m3-on-surface-variant mb-4">{t("welcome.description")}</p>
          <ul className="text-sm text-m3-on-surface-variant space-y-2 ml-5">
            <li>✓ {t("welcome.patients")}</li>
            <li>✓ {t("welcome.funds")}</li>
            <li>✓ {t("welcome.procedureTypes")}</li>
            <li>✓ {t("welcome.procedures")}</li>
          </ul>
          <p className="text-sm text-m3-on-surface-variant mt-4">{t("welcome.hint")}</p>
        </div>
      </div>
    );
  }

  if (!metrics || !selectedYear) {
    return (
      <div className="h-full bg-m3-surface p-12 flex items-center justify-center">
        <div className="text-m3-on-surface-variant animate-pulse">{t("computing")}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-m3-surface">
      {/* Fixed Header */}
      <div className="shrink-0 bg-m3-surface-container-low px-6 py-2 flex items-center justify-end">
        {/* Year Selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="year-selector" className="text-xs font-medium text-m3-primary">
            {t("year")}
          </label>
          <select
            id="year-selector"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-xl bg-m3-surface-container px-2 py-1 text-xs text-m3-on-surface focus:outline-none focus:ring-2 focus:ring-m3-primary"
          >
            {metrics.availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0">
        <div className="min-w-max px-6 py-4 pb-20">
          <div className="space-y-4">
            {/* Payments Section */}
            <div className="grid grid-cols-2 gap-4">
              <MonthCategoryTable
                title={t("payments", { year: selectedYear })}
                data={metrics.payments}
                categories={metrics.categories}
                annualDistinctPatients={metrics.annualDistinctPatientsPayments}
                annualProcedureCount={metrics.annualProcedureCount}
              />
              {previousYearMetrics ? (
                <MonthCategoryTable
                  title={t("payments", { year: selectedYear - 1 })}
                  data={previousYearMetrics.payments}
                  categories={previousYearMetrics.categories}
                  annualDistinctPatients={previousYearMetrics.annualDistinctPatientsPayments}
                  annualProcedureCount={previousYearMetrics.annualProcedureCount}
                />
              ) : (
                <div className="rounded-xl bg-m3-surface-container-lowest shadow-elevation-1 flex items-center justify-center">
                  <p className="text-xs text-m3-on-surface-variant">
                    {t("noDataYear", { year: selectedYear - 1 })}
                  </p>
                </div>
              )}
            </div>

            {/* Procedures Section */}
            <div className="grid grid-cols-2 gap-4">
              <MonthCategoryTable
                title={t("procedures", { year: selectedYear })}
                data={metrics.procedures}
                categories={metrics.categories}
                annualDistinctPatients={metrics.annualDistinctPatientsProcedures}
                annualProcedureCount={metrics.annualProcedureCount}
              />
              {previousYearMetrics ? (
                <MonthCategoryTable
                  title={t("procedures", { year: selectedYear - 1 })}
                  data={previousYearMetrics.procedures}
                  categories={previousYearMetrics.categories}
                  annualDistinctPatients={previousYearMetrics.annualDistinctPatientsProcedures}
                  annualProcedureCount={previousYearMetrics.annualProcedureCount}
                />
              ) : (
                <div className="rounded-xl bg-m3-surface-container-lowest shadow-elevation-1 flex items-center justify-center">
                  <p className="text-xs text-m3-on-surface-variant">
                    {t("noDataYear", { year: selectedYear - 1 })}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
