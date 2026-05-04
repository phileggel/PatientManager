import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReconcileAndCandidatesResponse, UnreconciledProcedure } from "@/bindings";
import * as gateway from "../gateway";
import { usePrintReport } from "./usePrintReport";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../gateway", () => ({
  extractPdfText: vi.fn(),
  parsePdfText: vi.fn(),
  reconcileAndCreateCandidates: vi.fn(),
  createFundPaymentWithAutoCorrections: vi.fn(),
  getUnreconciledProceduresInRange: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("i18next", () => ({
  default: { language: "fr", t: (k: string) => k },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockUnreconciledReport: UnreconciledProcedure[] = [
  {
    procedure_id: "proc-1",
    patient_name: "DUPONT Jean",
    ssn: "1234567890123",
    procedure_date: "2025-04-01",
    amount: 50000,
  },
];

const mockReconciliationData: ReconcileAndCandidatesResponse = {
  candidates: [],
  reconciliation: {
    matches: [],
  },
};

const baseArgs = {
  filePath: "/tmp/remise-2025-04.pdf",
  reportDateRange: { start: "2025-04-01", end: "2025-04-30" },
  unreconciledReport: mockUnreconciledReport,
  autoCorrections: new Map(),
  reconciliationData: mockReconciliationData,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePrintReport", () => {
  let fakeWrittenDoc: {
    open: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  let fakeWindow: {
    document: typeof fakeWrittenDoc;
    onload: null | (() => void);
    onafterprint: null | (() => void);
  };

  beforeEach(() => {
    vi.clearAllMocks();

    fakeWrittenDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    fakeWindow = { document: fakeWrittenDoc, onload: null, onafterprint: null };

    vi.stubGlobal("open", vi.fn().mockReturnValue(fakeWindow));
  });

  // ── Success path ───────────────────────────────────────────────────────────

  it("success: handlePrint calls window.open and writes the document; printError stays null", () => {
    const { result } = renderHook(() => usePrintReport(baseArgs));

    act(() => {
      result.current.handlePrint();
    });

    // window.open must have been invoked
    expect(window.open).toHaveBeenCalled();
    // The document was written (opened, content written, closed)
    expect(fakeWrittenDoc.write).toHaveBeenCalled();
    // No error set
    expect(result.current.printError).toBeNull();
  });

  it("success: window.open is called with a blank target (FPR-011)", () => {
    const { result } = renderHook(() => usePrintReport(baseArgs));

    act(() => {
      result.current.handlePrint();
    });

    // Must open a new window — first arg is a URL string (empty or 'about:blank'), second arg is '_blank'
    const calls = vi.mocked(window.open).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // The second argument should be "_blank" (new window target)
    expect(calls[0]?.[1]).toBe("_blank");
  });

  // ── Failure path (FPR-014) ─────────────────────────────────────────────────

  it("failure: window.open returns null → printError is set to a non-null string and logger.error is called once (FPR-014)", async () => {
    vi.stubGlobal("open", vi.fn().mockReturnValue(null));

    const loggerMod = await import("@/lib/logger");
    const { result } = renderHook(() => usePrintReport(baseArgs));

    act(() => {
      result.current.handlePrint();
    });

    expect(result.current.printError).not.toBeNull();
    expect(typeof result.current.printError).toBe("string");
    expect(loggerMod.logger.error).toHaveBeenCalledTimes(1);
  });

  // ── clearPrintError ────────────────────────────────────────────────────────

  it("clearPrintError: after failure sets printError, calling clearPrintError resets it to null", () => {
    vi.stubGlobal("open", vi.fn().mockReturnValue(null));

    const { result } = renderHook(() => usePrintReport(baseArgs));

    act(() => {
      result.current.handlePrint();
    });

    expect(result.current.printError).not.toBeNull();

    act(() => {
      result.current.clearPrintError();
    });

    expect(result.current.printError).toBeNull();
  });

  // ── No gateway call (FPR-013) ──────────────────────────────────────────────

  it("no gateway function is called during handlePrint (FPR-013)", () => {
    const { result } = renderHook(() => usePrintReport(baseArgs));

    act(() => {
      result.current.handlePrint();
    });

    expect(gateway.extractPdfText).not.toHaveBeenCalled();
    expect(gateway.parsePdfText).not.toHaveBeenCalled();
    expect(gateway.reconcileAndCreateCandidates).not.toHaveBeenCalled();
    expect(gateway.createFundPaymentWithAutoCorrections).not.toHaveBeenCalled();
    expect(gateway.getUnreconciledProceduresInRange).not.toHaveBeenCalled();
  });
});
