import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  DbMatch,
  NormalizedPdfLine,
  ReconciliationMatch,
  ReconciliationResult,
} from "@/bindings";
import { countTotalAnomalies } from "../shared/utils";
import { ReconciliationResultsView } from "./ReconciliationResults";

// Mock logger
vi.mock("@/infra/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockPdfLine: NormalizedPdfLine = {
  line_index: 1,
  payment_date: "2025-02-10",
  invoice_number: "456",
  fund_name: "MGEN",
  patient_name: "AUTRE PATIENT",
  ssn: "9876543210987",
  nature: "SF",
  procedure_start_date: "2025-02-06",
  procedure_end_date: "2025-02-06",
  is_period: false,
  amount: 50000,
};

const defaultProps = {
  acceptedKeys: new Set<string>(),
  autoCorrections: new Map(),
  onAcceptCorrection: vi.fn(),
  onUnacceptCorrection: vi.fn(),
};

describe("ReconciliationResults interactions", () => {
  it("clicking Create procedure on NotFoundIssue calls onAcceptCorrection with CreateProcedure correction", async () => {
    const user = userEvent.setup();
    const onAcceptCorrection = vi.fn();

    const result: ReconciliationResult = {
      matches: [
        {
          type: "NotFoundIssue",
          data: { pdf_line: mockPdfLine, nearby_candidates: [] },
        } as ReconciliationMatch,
      ],
    };

    render(
      <ReconciliationResultsView
        result={result}
        {...defaultProps}
        onAcceptCorrection={onAcceptCorrection}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Create/ }));

    expect(onAcceptCorrection).toHaveBeenCalledWith("CreateProcedure-1", {
      CreateProcedure: {
        ssn: "9876543210987",
        patient_name: "AUTRE PATIENT",
        procedure_date: "2025-02-06",
        payment_date: "2025-02-10",
        billed_amount: 50000,
        pdf_fund_label: "MGEN",
      },
    });
  });

  it("clicking Correct on SingleMatchIssue FundMismatch calls onAcceptCorrection with FundMismatch correction", async () => {
    const user = userEvent.setup();
    const onAcceptCorrection = vi.fn();

    const dbMatch: DbMatch = {
      procedure_id: "proc-1",
      procedure_date: "2025-02-06",
      fund_id: "fund-other",
      amount: 50000,
      anomalies: ["FundMismatch"],
    };

    const result: ReconciliationResult = {
      matches: [
        {
          type: "SingleMatchIssue",
          data: { pdf_line: mockPdfLine, db_match: dbMatch },
        } as ReconciliationMatch,
      ],
    };

    render(
      <ReconciliationResultsView
        result={result}
        {...defaultProps}
        onAcceptCorrection={onAcceptCorrection}
      />,
    );

    await user.click(screen.getByText(/Apply PDF fund/));

    expect(onAcceptCorrection).toHaveBeenCalledWith("FundMismatch-proc-1", {
      FundMismatch: {
        procedure_id: "proc-1",
        pdf_fund_label: "MGEN",
      },
    });
  });

  it("clicking correct button on SingleMatchIssue AmountMismatch applies PDF amount", async () => {
    const user = userEvent.setup();
    const onAcceptCorrection = vi.fn();

    const dbMatch: DbMatch = {
      procedure_id: "proc-1",
      procedure_date: "2025-02-06",
      fund_id: "fund-1",
      amount: 30000,
      anomalies: ["AmountMismatch"],
    };
    const pdfLine: NormalizedPdfLine = { ...mockPdfLine, amount: 50000 };

    const result: ReconciliationResult = {
      matches: [
        {
          type: "SingleMatchIssue",
          data: { pdf_line: pdfLine, db_match: dbMatch },
        } as ReconciliationMatch,
      ],
    };

    render(
      <ReconciliationResultsView
        result={result}
        {...defaultProps}
        onAcceptCorrection={onAcceptCorrection}
      />,
    );

    await user.click(screen.getByText(/Apply PDF amount/));

    expect(onAcceptCorrection).toHaveBeenCalledWith("AmountMismatch-proc-1", {
      AmountMismatch: { procedure_id: "proc-1", pdf_amount: 50000 },
    });
  });

  it("clicking Link on NotFoundIssue with nearby candidate calls onAcceptCorrection with LinkProcedure", async () => {
    const user = userEvent.setup();
    const onAcceptCorrection = vi.fn();

    const result: ReconciliationResult = {
      matches: [
        {
          type: "NotFoundIssue",
          data: {
            pdf_line: mockPdfLine,
            nearby_candidates: [
              {
                procedure_id: "proc-nearby",
                patient_name: "AUTRE PATIENT",
                ssn: "9876543210000",
                procedure_date: "2025-02-06",
                amount: 50000,
              },
            ],
          },
        } as ReconciliationMatch,
      ],
    };

    render(
      <ReconciliationResultsView
        result={result}
        {...defaultProps}
        onAcceptCorrection={onAcceptCorrection}
      />,
    );

    await user.click(screen.getByText(/Link this procedure/));

    // Key is line-scoped (#61): LinkProcedure-{line_index}-{procedure_id}.
    expect(onAcceptCorrection).toHaveBeenCalledWith("LinkProcedure-1-proc-nearby", {
      LinkProcedure: {
        procedure_id: "proc-nearby",
        pdf_ssn: "9876543210987",
        pdf_fund_label: "MGEN",
        payment_date: "2025-02-10",
      },
    });
  });

  it("linked candidate is filtered out when accepted for THIS line (#61)", () => {
    // mockPdfLine.line_index === 1 → the line-scoped accepted key.
    const acceptedKeys = new Set(["LinkProcedure-1-proc-nearby"]);

    const result: ReconciliationResult = {
      matches: [
        {
          type: "NotFoundIssue",
          data: {
            pdf_line: mockPdfLine,
            nearby_candidates: [
              {
                procedure_id: "proc-nearby",
                patient_name: "AUTRE PATIENT",
                ssn: "9876543210000",
                procedure_date: "2025-02-06",
                amount: 50000,
              },
            ],
          },
        } as ReconciliationMatch,
      ],
    };

    render(
      <ReconciliationResultsView
        result={result}
        acceptedKeys={acceptedKeys}
        autoCorrections={new Map()}
        onAcceptCorrection={vi.fn()}
        onUnacceptCorrection={vi.fn()}
      />,
    );

    // Candidate is gone: it was linked for THIS line.
    expect(screen.queryByText(/Link this procedure/)).toBeNull();
  });

  it("candidate stays available when the SAME procedure was linked for ANOTHER line (#61)", () => {
    // The same procedure linked under a DIFFERENT line (index 0) must NOT
    // suppress this line's (index 1) proposal — the core #61 regression.
    const acceptedKeys = new Set(["LinkProcedure-0-proc-nearby"]);

    const result: ReconciliationResult = {
      matches: [
        {
          type: "NotFoundIssue",
          data: {
            pdf_line: mockPdfLine, // line_index 1
            nearby_candidates: [
              {
                procedure_id: "proc-nearby",
                patient_name: "AUTRE PATIENT",
                ssn: "9876543210000",
                procedure_date: "2025-02-06",
                amount: 50000,
              },
            ],
          },
        } as ReconciliationMatch,
      ],
    };

    render(
      <ReconciliationResultsView
        result={result}
        acceptedKeys={acceptedKeys}
        autoCorrections={new Map()}
        onAcceptCorrection={vi.fn()}
        onUnacceptCorrection={vi.fn()}
      />,
    );

    // Still offered: the link under line 0 does not resolve line 1.
    expect(screen.queryByText(/Link this procedure/)).not.toBeNull();
  });
});

describe("GroupMatchIssue — Validate distribution", () => {
  it("clicking Validate distribution calls onAcceptCorrection for each db_match", async () => {
    const user = userEvent.setup();
    const onAcceptCorrection = vi.fn();

    const dbMatch1: DbMatch = {
      procedure_id: "proc-1",
      procedure_date: "2025-02-06",
      fund_id: "fund-1",
      amount: 30000,
      anomalies: ["AmountMismatch"],
    };
    const dbMatch2: DbMatch = {
      procedure_id: "proc-2",
      procedure_date: "2025-02-06",
      fund_id: "fund-1",
      amount: 20000,
      anomalies: ["AmountMismatch"],
    };
    const pdfLine: NormalizedPdfLine = { ...mockPdfLine, amount: 50000 };

    const result: ReconciliationResult = {
      matches: [
        {
          type: "GroupMatchIssue",
          data: { pdf_line: pdfLine, db_matches: [dbMatch1, dbMatch2] },
        } as ReconciliationMatch,
      ],
    };

    render(
      <ReconciliationResultsView
        result={result}
        {...defaultProps}
        onAcceptCorrection={onAcceptCorrection}
      />,
    );

    await user.click(screen.getByText(/Validate this distribution/));

    expect(onAcceptCorrection).toHaveBeenCalledTimes(2);
    expect(onAcceptCorrection).toHaveBeenCalledWith("AmountMismatch-proc-1", {
      AmountMismatch: { procedure_id: "proc-1", pdf_amount: 30000 },
    });
    expect(onAcceptCorrection).toHaveBeenCalledWith("AmountMismatch-proc-2", {
      AmountMismatch: { procedure_id: "proc-2", pdf_amount: 20000 },
    });
  });
});

describe("FPA-460 — un-handle a resolved anomaly", () => {
  it("shows Undo on a resolved issue and clears all of that issue's correction keys", async () => {
    const user = userEvent.setup();
    const onUnacceptCorrection = vi.fn();

    // FundMismatch already accepted + amounts equal → the issue is resolved.
    const dbMatch: DbMatch = {
      procedure_id: "proc-1",
      procedure_date: "2025-02-06",
      fund_id: "fund-other",
      amount: 50000,
      anomalies: ["FundMismatch"],
    };
    const result: ReconciliationResult = {
      matches: [
        {
          type: "SingleMatchIssue",
          data: { pdf_line: mockPdfLine, db_match: dbMatch },
        } as ReconciliationMatch,
      ],
    };

    render(
      <ReconciliationResultsView
        result={result}
        acceptedKeys={new Set(["FundMismatch-proc-1"])}
        autoCorrections={new Map()}
        onAcceptCorrection={vi.fn()}
        onUnacceptCorrection={onUnacceptCorrection}
      />,
    );

    await user.click(screen.getByText("Modify"));

    expect(onUnacceptCorrection).toHaveBeenCalledWith([
      "FundMismatch-proc-1",
      "ContestAmount-proc-1",
    ]);
  });

  it("does not show Undo while the issue is unresolved", () => {
    const dbMatch: DbMatch = {
      procedure_id: "proc-1",
      procedure_date: "2025-02-06",
      fund_id: "fund-other",
      amount: 50000,
      anomalies: ["FundMismatch"],
    };
    const result: ReconciliationResult = {
      matches: [
        {
          type: "SingleMatchIssue",
          data: { pdf_line: mockPdfLine, db_match: dbMatch },
        } as ReconciliationMatch,
      ],
    };

    render(<ReconciliationResultsView result={result} {...defaultProps} />);

    expect(screen.queryByText("Modify")).toBeNull();
  });
});

describe("countTotalAnomalies", () => {
  it("counts anomalies from all issue types", () => {
    const pdfLine: NormalizedPdfLine = {
      line_index: 0,
      payment_date: "2025-02-10",
      invoice_number: "123",
      fund_name: "CPAM n° 931",
      patient_name: "Test",
      ssn: "1234567890123",
      nature: "SF",
      procedure_start_date: "2025-02-05",
      procedure_end_date: "2025-02-05",
      is_period: false,
      amount: 100.0,
    };

    const dbMatchWithAnomalies: DbMatch = {
      procedure_id: "proc-1",
      procedure_date: "2025-02-05",
      fund_id: "fund-1",
      amount: 100.0,
      anomalies: ["AmountMismatch", "DateMismatch"],
    };

    const result: ReconciliationResult = {
      matches: [
        {
          type: "SingleMatchIssue",
          data: { pdf_line: pdfLine, db_match: dbMatchWithAnomalies },
        } as ReconciliationMatch,
        {
          type: "NotFoundIssue",
          data: { pdf_line: pdfLine, nearby_candidates: [] },
        } as ReconciliationMatch,
        {
          type: "TooManyMatchIssue",
          data: { pdf_line: pdfLine, candidate_ids: ["id1", "id2"] },
        } as ReconciliationMatch,
      ],
    };

    expect(countTotalAnomalies(result)).toBe(3);
  });

  it("returns 0 when only perfect matches", () => {
    const pdfLine: NormalizedPdfLine = {
      line_index: 0,
      payment_date: "2025-02-10",
      invoice_number: "123",
      fund_name: "CPAM n° 931",
      patient_name: "Test",
      ssn: "1234567890123",
      nature: "SF",
      procedure_start_date: "2025-02-05",
      procedure_end_date: "2025-02-05",
      is_period: false,
      amount: 100.0,
    };

    const dbMatch: DbMatch = {
      procedure_id: "proc-1",
      procedure_date: "2025-02-05",
      fund_id: "fund-1",
      amount: 100.0,
      anomalies: [],
    };

    const result: ReconciliationResult = {
      matches: [
        {
          type: "PerfectSingleMatch",
          data: { pdf_line: pdfLine, db_match: dbMatch },
        } as ReconciliationMatch,
      ],
    };

    expect(countTotalAnomalies(result)).toBe(0);
  });
});
