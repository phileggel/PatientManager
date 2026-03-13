import type { Procedure } from "@/bindings";

export interface DashboardData {
  procedures: Procedure[];
}

export interface MonthCategoryData {
  [category: string]: number; // category -> total amount
}

export interface MonthlyMetrics {
  distinctPatients: number;
  procedureCount: number;
  amounts: MonthCategoryData; // category -> total amount
}

export interface YearlyData {
  [month: number]: MonthlyMetrics; // 1-12 -> month data
}

export interface DashboardMetrics {
  payments: YearlyData;
  procedures: YearlyData;
  categories: string[]; // unique categories
  availableYears: number[]; // years with data
  annualDistinctPatientsPayments: number; // unique patients in payment table for entire year
  annualDistinctPatientsProcedures: number; // unique patients in procedure table for entire year
  annualProcedureCount: number; // total procedure count for entire year
}
