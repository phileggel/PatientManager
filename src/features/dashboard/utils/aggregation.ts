import type { Procedure, ProcedureType } from "@/bindings";
import type { DashboardMetrics, YearlyData } from "../types";

export function getAvailableYears(procedures: Procedure[]): number[] {
  const years = new Set<number>();

  for (const proc of procedures) {
    if (proc.procedure_date) {
      years.add(new Date(proc.procedure_date).getFullYear());
    }
    if (proc.confirmed_payment_date) {
      years.add(new Date(proc.confirmed_payment_date).getFullYear());
    }
  }

  return Array.from(years).sort((a, b) => b - a); // descending order
}

export function aggregateDashboardMetrics(
  procedures: Procedure[],
  procedureTypes: ProcedureType[],
  selectedYear: number,
  uncategorizedLabel: string,
): DashboardMetrics {
  // Create category lookup
  const categoryLookup = new Map<string, string>();
  const categoriesSet = new Set<string>();

  for (const pt of procedureTypes) {
    const category = pt.category || uncategorizedLabel;
    categoryLookup.set(pt.id, category);
    categoriesSet.add(category);
  }

  const payments: YearlyData = {};
  const proceduresData: YearlyData = {};

  // Initialize monthly data structures
  for (let month = 1; month <= 12; month++) {
    payments[month] = {
      distinctPatients: 0,
      procedureCount: 0,
      amounts: {},
    };
    proceduresData[month] = {
      distinctPatients: 0,
      procedureCount: 0,
      amounts: {},
    };
  }

  // Track patients per month for distinct count
  const procedurePatients = new Map<number, Set<string>>(); // month -> set of patient_ids
  const paymentPatients = new Map<number, Set<string>>(); // month -> set of patient_ids
  const allProcedurePatients = new Set<string>(); // all patients across all months
  const allPaymentPatients = new Set<string>(); // all patients across all months

  for (let month = 1; month <= 12; month++) {
    procedurePatients.set(month, new Set());
    paymentPatients.set(month, new Set());
  }

  for (const proc of procedures) {
    const category = categoryLookup.get(proc.procedure_type_id) || uncategorizedLabel;

    // Process procedures by procedure_date
    if (proc.procedure_date) {
      const procDate = new Date(proc.procedure_date);
      const year = procDate.getFullYear();

      if (year === selectedYear) {
        const month = procDate.getMonth() + 1; // 1-12
        const procMonthData = proceduresData[month];
        if (procMonthData) {
          procMonthData.procedureCount += 1;
          procedurePatients.get(month)?.add(proc.patient_id);
          allProcedurePatients.add(proc.patient_id);
          procMonthData.amounts[category] =
            (procMonthData.amounts[category] || 0) + (proc.procedure_amount || 0);
        }
      }
    }

    // Process payments by confirmed_payment_date
    if (proc.confirmed_payment_date && proc.actual_payment_amount) {
      const paymentDate = new Date(proc.confirmed_payment_date);
      const year = paymentDate.getFullYear();

      if (year === selectedYear) {
        const month = paymentDate.getMonth() + 1;
        const payMonthData = payments[month];
        if (payMonthData) {
          payMonthData.procedureCount += 1;
          paymentPatients.get(month)?.add(proc.patient_id);
          allPaymentPatients.add(proc.patient_id);
          payMonthData.amounts[category] =
            (payMonthData.amounts[category] || 0) + proc.actual_payment_amount;
        }
      }
    }
  }

  // Set distinct patient counts
  for (let month = 1; month <= 12; month++) {
    const procMonth = proceduresData[month];
    const payMonth = payments[month];
    if (procMonth) {
      procMonth.distinctPatients = procedurePatients.get(month)?.size ?? 0;
    }
    if (payMonth) {
      payMonth.distinctPatients = paymentPatients.get(month)?.size ?? 0;
    }
  }

  // Calculate annual totals
  let annualProcedureCount = 0;
  for (let month = 1; month <= 12; month++) {
    annualProcedureCount += proceduresData[month]?.procedureCount ?? 0;
  }

  return {
    payments,
    procedures: proceduresData,
    categories: Array.from(categoriesSet).sort(),
    availableYears: getAvailableYears(procedures),
    annualDistinctPatientsPayments: allPaymentPatients.size,
    annualDistinctPatientsProcedures: allProcedurePatients.size,
    annualProcedureCount,
  };
}
