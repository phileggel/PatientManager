import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoCorrection } from "@/bindings";
import { useReconciliationModal } from "./useReconciliationModal";

vi.mock("../gateway", () => ({
  extractPdfText: vi.fn(),
  parsePdfText: vi.fn(),
  reconcileAndCreateCandidates: vi.fn(),
  createFundPaymentWithAutoCorrections: vi.fn(),
  getUnreconciledProceduresInRange: vi.fn(),
}));

import * as gateway from "../gateway";

const mockExtract = vi.mocked(gateway.extractPdfText);
const mockParse = vi.mocked(gateway.parsePdfText);
const mockReconcile = vi.mocked(gateway.reconcileAndCreateCandidates);

// A PDF with 1 group and 1 line — computePdfDateRange returns a valid range
const PDF_WITH_LINE = {
  groups: [
    {
      fund_label: "CPAM",
      fund_full_name: "CPAM France",
      payment_date: "2026-03-10",
      total_amount: 50000,
      is_total_valid: true,
      lines: [
        {
          line_index: 0,
          payment_date: "2026-03-10",
          invoice_number: "123",
          fund_name: "CPAM",
          patient_name: "DUPONT",
          ssn: "123",
          nature: "SF",
          procedure_start_date: "2026-02-28",
          procedure_end_date: "2026-02-28",
          is_period: false,
          amount: 50000,
        },
      ],
    },
  ],
  unparsed_line_count: 0,
  unparsed_lines: [],
};

// A PDF with no groups — computePdfDateRange returns null → handleValidate calls onClose
const PDF_NO_LINES = { groups: [], unparsed_line_count: 0, unparsed_lines: [] };

// reconciliationData with a FundMismatch anomaly — totalAnomalies=1, canValidate=false initially
const RECONCILE_WITH_ANOMALY = {
  candidates: [],
  reconciliation: {
    matches: [
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            line_index: 0,
            payment_date: "2026-03-10",
            invoice_number: "123",
            fund_name: "CPAM",
            patient_name: "DUPONT",
            ssn: "123",
            nature: "SF",
            procedure_start_date: "2026-02-28",
            procedure_end_date: "2026-02-28",
            is_period: false,
            amount: 50000,
          },
          db_match: {
            procedure_id: "proc-1",
            procedure_date: "2026-02-28",
            fund_id: "fund-1",
            amount: 50000,
            anomalies: ["FundMismatch"],
          },
        },
      },
    ],
  },
};

// reconciliationData with no anomalies — totalAnomalies=0, canValidate=true immediately
const RECONCILE_NO_ANOMALIES = {
  candidates: [],
  reconciliation: { matches: [] },
};

describe("useReconciliationModal — direct state setters", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockExtract.mockResolvedValue({ success: true, data: "PDF text" });
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
    mockParse.mockResolvedValue(PDF_WITH_LINE as any);
    // Use an anomaly so totalAnomalies=1 → canValidate=false (Validate stays disabled)
    // biome-ignore lint/suspicious/noExplicitAny: test fixture — ReconciliationMatch is a discriminated union that TypeScript widens
    mockReconcile.mockResolvedValue({ success: true, data: RECONCILE_WITH_ANOMALY } as any);
  });

  it("handleAcceptCorrection adds key to acceptedKeys and stores the correction", async () => {
    const { result } = renderHook(() => useReconciliationModal("/test.pdf", onClose));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const correction: AutoCorrection = {
      FundMismatch: { procedure_id: "proc-1", pdf_fund_label: "CPAM" },
    };
    act(() => result.current.handleAcceptCorrection("FundMismatch-proc-1", correction));

    expect(result.current.acceptedKeys.has("FundMismatch-proc-1")).toBe(true);
    expect(result.current.autoCorrections.get("FundMismatch-proc-1")).toEqual(correction);
  });

  it("handleReportResolvedCount updates resolvedCount", async () => {
    const { result } = renderHook(() => useReconciliationModal("/test.pdf", onClose));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleReportResolvedCount(2));

    expect(result.current.resolvedCount).toBe(2);
  });

  it("handleAutoCorrectAll builds FundMismatch correction for SingleMatchIssue anomaly", async () => {
    const { result } = renderHook(() => useReconciliationModal("/test.pdf", onClose));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleAutoCorrectAll());

    const key = "FundMismatch-proc-1";
    expect(result.current.acceptedKeys.has(key)).toBe(true);
    expect(result.current.autoCorrections.get(key)).toEqual({
      FundMismatch: { procedure_id: "proc-1", pdf_fund_label: "CPAM" },
    });
  });
});

describe("useReconciliationModal — handleValidate null dateRange calls onClose", () => {
  it("calls onClose when parsedData has no groups (computePdfDateRange returns null)", async () => {
    const onClose = vi.fn();
    vi.mocked(gateway.extractPdfText).mockResolvedValue({ success: true, data: "text" });
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
    vi.mocked(gateway.parsePdfText).mockResolvedValue(PDF_NO_LINES as any);
    // biome-ignore lint/suspicious/noExplicitAny: test fixture cast
    vi.mocked(gateway.reconcileAndCreateCandidates).mockResolvedValue({
      success: true,
      data: RECONCILE_NO_ANOMALIES,
    } as any);
    vi.mocked(gateway.createFundPaymentWithAutoCorrections).mockResolvedValue({
      success: true,
      data: [],
    });

    const { result } = renderHook(() => useReconciliationModal("/test.pdf", onClose));

    // FPA-460 — validation is explicit; trigger it once the data has loaded.
    await waitFor(() => expect(result.current.canValidate).toBe(true));
    await act(async () => {
      await result.current.handleValidate();
    });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(gateway.createFundPaymentWithAutoCorrections).toHaveBeenCalled();
    // getUnreconciledProceduresInRange must NOT be called (no date range available)
    expect(gateway.getUnreconciledProceduresInRange).not.toHaveBeenCalled();
  });
});

// #61: two NotFoundIssue lines on the same date share one nearby_candidates
// list. handleAutoCorrectAll must give the second line its own CreateProcedure
// correction even when the first line already has a (line-scoped) link.
describe("useReconciliationModal — handleAutoCorrectAll with two shared-candidate NotFound lines (#61)", () => {
  const onClose = vi.fn();

  const sharedCandidates = [
    {
      procedure_id: "proc-a",
      patient_name: "DUPONT",
      ssn: "",
      procedure_date: "2026-02-28",
      amount: 23000,
    },
  ];

  const makeNotFound = (lineIndex: number, amount: number) => ({
    type: "NotFoundIssue",
    data: {
      pdf_line: {
        line_index: lineIndex,
        payment_date: "2026-03-10",
        invoice_number: `${lineIndex}`,
        fund_name: "CPAM",
        patient_name: "DUPONT",
        ssn: "123",
        nature: "SF",
        procedure_start_date: "2026-02-28",
        procedure_end_date: "2026-02-28",
        is_period: false,
        amount,
      },
      nearby_candidates: sharedCandidates,
    },
  });

  const RECONCILE_TWO_NOT_FOUND = {
    candidates: [],
    reconciliation: { matches: [makeNotFound(0, 23000), makeNotFound(1, 3500)] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExtract.mockResolvedValue({ success: true, data: "PDF text" });
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
    mockParse.mockResolvedValue(PDF_WITH_LINE as any);
    // biome-ignore lint/suspicious/noExplicitAny: discriminated-union widening
    mockReconcile.mockResolvedValue({ success: true, data: RECONCILE_TWO_NOT_FOUND } as any);
  });

  it("gives the second line its own CreateProcedure even when the first is already linked", async () => {
    const { result } = renderHook(() => useReconciliationModal("/test.pdf", onClose));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Pre-link the shared candidate to line 0 only (line-scoped key).
    act(() =>
      result.current.handleAcceptCorrection("LinkProcedure-0-proc-a", {
        LinkProcedure: {
          procedure_id: "proc-a",
          pdf_ssn: "123",
          pdf_fund_label: "CPAM",
          payment_date: "2026-03-10",
        },
      }),
    );

    act(() => result.current.handleAutoCorrectAll());

    // Line 1 still needs resolution → it gets its own CreateProcedure.
    expect(result.current.acceptedKeys.has("CreateProcedure-1")).toBe(true);
    // Line 0 was already linked → no CreateProcedure created for it.
    expect(result.current.acceptedKeys.has("CreateProcedure-0")).toBe(false);
  });
});

// F27: a typed gateway error must surface a (translated) message through the
// presenter, not crash or leave the modal stuck loading.
describe("useReconciliationModal — typed gateway error surfaces a message (F27)", () => {
  it("sets error and renders no reconciliation data when extract returns a typed error", async () => {
    vi.clearAllMocks();
    mockExtract.mockResolvedValue({ success: false, error: { code: "PdfPathRejected" } });

    const { result } = renderHook(() => useReconciliationModal("/bad.pdf", vi.fn()));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.reconciliationData).toBeNull();
  });

  it("surfaces a validation error when getUnreconciledProceduresInRange returns a typed error", async () => {
    vi.clearAllMocks();
    mockExtract.mockResolvedValue({ success: true, data: "PDF text" });
    // biome-ignore lint/suspicious/noExplicitAny: test fixture
    mockParse.mockResolvedValue(PDF_WITH_LINE as any); // valid date range
    // No anomalies → canValidate=true; FPA-460 makes validation explicit.
    // biome-ignore lint/suspicious/noExplicitAny: discriminated-union widening
    mockReconcile.mockResolvedValue({ success: true, data: RECONCILE_NO_ANOMALIES } as any);
    vi.mocked(gateway.createFundPaymentWithAutoCorrections).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(gateway.getUnreconciledProceduresInRange).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });

    const { result } = renderHook(() => useReconciliationModal("/test.pdf", vi.fn()));

    await waitFor(() => expect(result.current.canValidate).toBe(true));
    await act(async () => {
      await result.current.handleValidate();
    });

    await waitFor(() => expect(result.current.validationError).toBeTruthy());
    expect(result.current.unreconciledReport).toBeNull();
  });
});
