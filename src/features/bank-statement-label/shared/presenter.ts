import type {
  BankAccount,
  BankFundLabelMapping,
  BankStatementReconciliationError,
  Fund,
} from "@/bindings";

/** What a bank statement label is assigned to (BAS-030, BAS-041D). */
export type LabelAssignment =
  | { kind: "fund"; fundName: string }
  | { kind: "ignored" }
  | { kind: "deletedFund" };

export interface BankStatementLabelRow {
  id: string;
  accountName: string;
  label: string;
  fundId: string | null;
  assignment: LabelAssignment;
}

export type SortKey = "account" | "label" | "fund";
export interface SortConfig {
  key: SortKey;
  direction: "asc" | "desc";
}

/** Translated texts for the two assignments that carry no fund name. */
export interface AssignmentTexts {
  ignored: string;
  deletedFund: string;
}

/** BAS-041 / BAS-041D — one row per saved label, with its account and fund names. */
export function toRows(
  labels: BankFundLabelMapping[],
  accounts: BankAccount[],
  funds: Fund[],
): BankStatementLabelRow[] {
  return labels.map((l) => {
    const fund = l.fund_id === null ? undefined : funds.find((f) => f.id === l.fund_id);
    const assignment: LabelAssignment =
      l.fund_id === null
        ? { kind: "ignored" }
        : fund
          ? { kind: "fund", fundName: fund.name }
          : { kind: "deletedFund" };
    return {
      id: l.id,
      accountName: accounts.find((a) => a.id === l.bank_account_id)?.name ?? "",
      label: l.bank_label,
      fundId: l.fund_id,
      assignment,
    };
  });
}

export function assignmentText(assignment: LabelAssignment, texts: AssignmentTexts): string {
  switch (assignment.kind) {
    case "fund":
      return assignment.fundName;
    case "ignored":
      return texts.ignored;
    case "deletedFund":
      return texts.deletedFund;
  }
}

/** Case- and accent-insensitive form used for search and sort. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function columnValue(row: BankStatementLabelRow, key: SortKey, texts: AssignmentTexts): string {
  switch (key) {
    case "account":
      return row.accountName;
    case "label":
      return row.label;
    case "fund":
      return assignmentText(row.assignment, texts);
  }
}

/**
 * BAS-041A / BAS-041B — keep the rows whose account, label or fund contains the
 * search text, then sort by the chosen column, or by account then label.
 */
export function filterAndSortRows(
  rows: BankStatementLabelRow[],
  search: string,
  sort: SortConfig | null,
  texts: AssignmentTexts,
): BankStatementLabelRow[] {
  const term = fold(search.trim());
  const kept = term
    ? rows.filter((r) =>
        (["account", "label", "fund"] as const).some((k) =>
          fold(columnValue(r, k, texts)).includes(term),
        ),
      )
    : rows;
  const compare = (a: string, b: string) => fold(a).localeCompare(fold(b));
  return kept.toSorted((a, b) => {
    if (!sort) {
      return compare(a.accountName, b.accountName) || compare(a.label, b.label);
    }
    const order = compare(columnValue(a, sort.key, texts), columnValue(b, sort.key, texts));
    return sort.direction === "asc" ? order : -order;
  });
}

/**
 * F27 layer 3 — BAS-042 / BAS-044 errors of the review screen. Only these two
 * codes are reachable with a distinct meaning here; every other code of the
 * composite is the generic failure (BAS-045).
 */
export function formatLabelError(err: BankStatementReconciliationError): { key: string } {
  switch (err.code) {
    case "LabelMappingNotFound":
      return { key: "bank:statement_label.error.gone" };
    case "FundNotFound":
      return { key: "bank:statement_label.error.fund_gone" };
    default:
      return { key: "bank:statement_label.error.unknown" };
  }
}
