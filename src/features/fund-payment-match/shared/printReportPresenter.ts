import type { AutoCorrection, ReconciliationMatch, UnreconciledProcedure } from "@/bindings";

export interface PrintReportInput {
  pdfFileName: string;
  periodStart: string;
  periodEnd: string;
  generationDate: string;
  unreconciled: UnreconciledProcedure[];
  autoCorrections: Map<string, AutoCorrection>;
  matches: ReconciliationMatch[];
}

export type ContestAmountRow = {
  patientName: string;
  procedureDate: string;
  billedAmountThousandths: number;
  paidAmountThousandths: number;
};

export type CreateProcedureRow = {
  patientName: string;
  ssn: string;
  procedureDate: string;
  fundLabel: string;
  billedAmountThousandths: number;
};

export type LinkProcedureRow = {
  patientName: string;
  ssn: string;
  fundLabel: string;
  paymentDate: string;
};

export type AmountMismatchRow = {
  patientName: string;
  procedureDate: string;
  originalAmountThousandths: number;
  correctedAmountThousandths: number;
};

export type FundMismatchRow = {
  patientName: string;
  procedureDate: string;
  originalFundId: string | null;
  correctedFundLabel: string;
};

export type DateMismatchRow = {
  patientName: string;
  originalDate: string;
  correctedDate: string;
};

export type CorrectionGroup =
  | { type: "ContestAmount"; rows: ContestAmountRow[] }
  | { type: "CreateProcedure"; rows: CreateProcedureRow[] }
  | { type: "LinkProcedure"; rows: LinkProcedureRow[] }
  | { type: "AmountMismatch"; rows: AmountMismatchRow[] }
  | { type: "FundMismatch"; rows: FundMismatchRow[] }
  | { type: "DateMismatch"; rows: DateMismatchRow[] };

export interface PrintReportViewModel {
  header: {
    title: string;
    pdfFileName: string;
    periodStart: string;
    periodEnd: string;
    generationDate: string;
  };
  unreconciledRows: { date: string; patientName: string; ssn: string; amountThousandths: number }[];
  unreconciledTotalThousandths: number | null;
  correctionGroups: CorrectionGroup[];
}

const PRIORITY_ORDER = [
  "ContestAmount",
  "CreateProcedure",
  "LinkProcedure",
  "AmountMismatch",
  "FundMismatch",
  "DateMismatch",
] as const;

type CorrectionType = (typeof PRIORITY_ORDER)[number];

function findMatchData(matches: ReconciliationMatch[], procedureId: string) {
  for (const match of matches) {
    if (
      (match.type === "SingleMatchIssue" || match.type === "PerfectSingleMatch") &&
      match.data.db_match.procedure_id === procedureId
    ) {
      return { pdf_line: match.data.pdf_line, db_match: match.data.db_match };
    }
    if (match.type === "GroupMatchIssue" || match.type === "PerfectGroupMatch") {
      const dbMatch = match.data.db_matches.find((m) => m.procedure_id === procedureId);
      if (dbMatch) return { pdf_line: match.data.pdf_line, db_match: dbMatch };
    }
  }
  return null;
}

function rowSortDate(type: CorrectionType, row: unknown): string {
  const r = row as Partial<Record<string, string>>;
  switch (type) {
    case "ContestAmount":
    case "CreateProcedure":
    case "AmountMismatch":
    case "FundMismatch":
      return r.procedureDate ?? "";
    case "LinkProcedure":
      return r.paymentDate ?? "";
    case "DateMismatch":
      return r.originalDate ?? "";
  }
}

export function buildPrintReportViewModel(input: PrintReportInput): PrintReportViewModel {
  const {
    pdfFileName,
    periodStart,
    periodEnd,
    generationDate,
    unreconciled,
    autoCorrections,
    matches,
  } = input;

  const unreconciledRows = unreconciled.map((p) => ({
    date: p.procedure_date,
    patientName: p.patient_name,
    ssn: p.ssn,
    amountThousandths: p.amount,
  }));

  const unreconciledTotalThousandths =
    unreconciledRows.length === 0
      ? null
      : unreconciledRows.reduce((sum, r) => sum + r.amountThousandths, 0);

  const buckets: Record<CorrectionType, unknown[]> = {
    ContestAmount: [],
    CreateProcedure: [],
    LinkProcedure: [],
    AmountMismatch: [],
    FundMismatch: [],
    DateMismatch: [],
  };

  for (const correction of autoCorrections.values()) {
    if ("ContestAmount" in correction) {
      const { procedure_id, paid_amount } = correction.ContestAmount;
      const m = findMatchData(matches, procedure_id);
      const row: ContestAmountRow = {
        patientName: m?.pdf_line.patient_name ?? "",
        procedureDate: m?.db_match.procedure_date ?? "",
        billedAmountThousandths: m?.db_match.amount ?? 0,
        paidAmountThousandths: paid_amount,
      };
      buckets.ContestAmount.push(row);
    } else if ("CreateProcedure" in correction) {
      const c = correction.CreateProcedure;
      const row: CreateProcedureRow = {
        patientName: c.patient_name,
        ssn: c.ssn,
        procedureDate: c.procedure_date,
        fundLabel: c.pdf_fund_label,
        billedAmountThousandths: c.billed_amount,
      };
      buckets.CreateProcedure.push(row);
    } else if ("LinkProcedure" in correction) {
      const { procedure_id, pdf_ssn, pdf_fund_label, payment_date } = correction.LinkProcedure;
      const m = findMatchData(matches, procedure_id);
      const row: LinkProcedureRow = {
        patientName: m?.pdf_line.patient_name ?? "",
        ssn: pdf_ssn,
        fundLabel: pdf_fund_label,
        paymentDate: payment_date,
      };
      buckets.LinkProcedure.push(row);
    } else if ("AmountMismatch" in correction) {
      const { procedure_id, pdf_amount } = correction.AmountMismatch;
      const m = findMatchData(matches, procedure_id);
      const row: AmountMismatchRow = {
        patientName: m?.pdf_line.patient_name ?? "",
        procedureDate: m?.db_match.procedure_date ?? "",
        originalAmountThousandths: m?.db_match.amount ?? 0,
        correctedAmountThousandths: pdf_amount,
      };
      buckets.AmountMismatch.push(row);
    } else if ("FundMismatch" in correction) {
      const { procedure_id, pdf_fund_label } = correction.FundMismatch;
      const m = findMatchData(matches, procedure_id);
      const row: FundMismatchRow = {
        patientName: m?.pdf_line.patient_name ?? "",
        procedureDate: m?.db_match.procedure_date ?? "",
        originalFundId: m?.db_match.fund_id ?? null,
        correctedFundLabel: pdf_fund_label,
      };
      buckets.FundMismatch.push(row);
    } else if ("DateMismatch" in correction) {
      const { procedure_id, pdf_date } = correction.DateMismatch;
      const m = findMatchData(matches, procedure_id);
      const row: DateMismatchRow = {
        patientName: m?.pdf_line.patient_name ?? "",
        originalDate: m?.db_match.procedure_date ?? "",
        correctedDate: pdf_date,
      };
      buckets.DateMismatch.push(row);
    }
  }

  const correctionGroups: CorrectionGroup[] = [];
  for (const type of PRIORITY_ORDER) {
    const rows = buckets[type];
    if (rows.length === 0) continue;
    rows.sort((a, b) => rowSortDate(type, a).localeCompare(rowSortDate(type, b)));
    correctionGroups.push({ type, rows } as CorrectionGroup);
  }

  return {
    header: {
      title: "print.title",
      pdfFileName,
      periodStart,
      periodEnd,
      generationDate,
    },
    unreconciledRows,
    unreconciledTotalThousandths,
    correctionGroups,
  };
}
