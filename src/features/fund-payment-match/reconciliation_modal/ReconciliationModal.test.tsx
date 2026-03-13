import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gateway from "../gateway";
import { ReconciliationModal } from "./ReconciliationModal";

// Mock the gateway
vi.mock("../gateway", () => ({
  extractPdfTextFromFile: vi.fn(),
  parsePdfText: vi.fn(),
  reconcileAndCreateCandidates: vi.fn(),
  createFundPaymentWithAutoCorrections: vi.fn(),
  getUnreconciledProceduresInRange: vi.fn(),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockParsedData = {
  groups: [
    {
      fund_label: "CPAM n° 931",
      fund_full_name: "Caisse d'assurance maladie",
      payment_date: "2025-05-02",
      total_amount: 38.4,
      is_total_valid: true,
      lines: [
        {
          line_index: 0,
          payment_date: "2025-05-02",
          invoice_number: "012345678",
          fund_name: "CPAM n° 931",
          patient_name: "DISCO ONE",
          ssn: "1234567890123",
          nature: "SF",
          procedure_start_date: "2025-04-28",
          procedure_end_date: "2025-04-28",
          is_period: false,
          amount: 38.4,
        },
      ],
    },
  ],
  unparsed_line_count: 0,
  unparsed_lines: [],
};

const mockPdfLineForModal = {
  line_index: 0,
  payment_date: "2025-05-02",
  invoice_number: "012345678",
  fund_name: "CPAM n° 931",
  patient_name: "DISCO ONE",
  ssn: "1234567890123",
  nature: "SF",
  procedure_start_date: "2025-04-28",
  procedure_end_date: "2025-04-28",
  is_period: false,
  amount: 38.4,
};

const mockDbMatchForModal = {
  procedure_id: "proc-1",
  procedure_date: "2025-04-28",
  fund_id: "fund-1",
  amount: 38.4,
  anomalies: [],
};

const mockDbMatchWithAnomalyForModal = {
  procedure_id: "proc-1",
  procedure_date: "2025-04-28",
  fund_id: "fund-1",
  amount: 50.0,
  anomalies: ["AmountMismatch"],
};

const mockReconciliationNoAnomalies = {
  candidates: [
    {
      fund_label: "CPAM n° 931",
      payment_date: "2025-05-02",
      total_amount: 38.4,
      procedure_ids: ["proc-1"],
      matched_amount: 38.4,
      is_fully_covered: true,
    },
  ],
  reconciliation: {
    matches: [
      {
        type: "PerfectSingleMatch",
        data: {
          pdf_line: mockPdfLineForModal,
          db_match: mockDbMatchForModal,
        },
      },
    ],
  },
};

const mockReconciliationWithAnomaly = {
  candidates: [
    {
      fund_label: "CPAM n° 931",
      payment_date: "2025-05-02",
      total_amount: 38.4,
      procedure_ids: ["proc-1"],
      matched_amount: 50.0,
      is_fully_covered: false,
    },
  ],
  reconciliation: {
    matches: [
      {
        type: "SingleMatchIssue",
        data: {
          pdf_line: {
            ...mockPdfLineForModal,
            amount: 50.0,
          },
          db_match: mockDbMatchWithAnomalyForModal,
        },
      },
    ],
  },
};

describe("ReconciliationModal", () => {
  const mockFile = new File(["dummy content"], "test.pdf", { type: "application/pdf" });
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (gateway.extractPdfTextFromFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      "PDF text content",
    );
    (gateway.parsePdfText as ReturnType<typeof vi.fn>).mockResolvedValue(mockParsedData);
    (gateway.reconcileAndCreateCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockReconciliationNoAnomalies,
    );
    (gateway.getUnreconciledProceduresInRange as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("does not auto-validate when unresolved anomalies exist", async () => {
    (gateway.reconcileAndCreateCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockReconciliationWithAnomaly,
    );

    render(<ReconciliationModal file={mockFile} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Auto-correct all/)).toBeInTheDocument();
    });

    expect(gateway.createFundPaymentWithAutoCorrections).not.toHaveBeenCalled();
  });

  it("auto-validates after clicking Corriger automatiquement", async () => {
    const user = userEvent.setup();

    (gateway.reconcileAndCreateCandidates as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockReconciliationWithAnomaly,
    );
    (gateway.createFundPaymentWithAutoCorrections as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );

    render(<ReconciliationModal file={mockFile} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Auto-correct all/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Auto-correct all/));

    await waitFor(() => {
      expect(gateway.createFundPaymentWithAutoCorrections).toHaveBeenCalled();
    });
  });

  it("auto-validates immediately when no anomalies", async () => {
    (gateway.createFundPaymentWithAutoCorrections as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );

    render(<ReconciliationModal file={mockFile} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(gateway.createFundPaymentWithAutoCorrections).toHaveBeenCalledWith({
        candidates: mockReconciliationNoAnomalies.candidates,
        auto_corrections: [],
      });
    });
  });

  it("calls getUnreconciledProceduresInRange with date range derived from PDF after auto-validation", async () => {
    (gateway.createFundPaymentWithAutoCorrections as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );

    render(<ReconciliationModal file={mockFile} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(gateway.getUnreconciledProceduresInRange).toHaveBeenCalledWith(
        "2025-04-28",
        "2025-04-28",
      );
    });

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("closes modal when clicking Close in unreconciled report", async () => {
    const user = userEvent.setup();

    (gateway.createFundPaymentWithAutoCorrections as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );

    render(<ReconciliationModal file={mockFile} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Unreconciled procedures/)).toBeInTheDocument();
    });

    await user.click(screen.getByText("Close"));

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("shows error state when PDF reconciliation fails to load", async () => {
    (gateway.reconcileAndCreateCandidates as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );

    render(<ReconciliationModal file={mockFile} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows error message when auto-validation fails", async () => {
    (gateway.createFundPaymentWithAutoCorrections as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Validation failed"),
    );

    render(<ReconciliationModal file={mockFile} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText("Validation failed")).toBeInTheDocument();
    });

    expect(mockOnClose).not.toHaveBeenCalled();
  });
});
