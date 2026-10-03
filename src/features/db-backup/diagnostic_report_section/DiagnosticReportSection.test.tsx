import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../gateway", () => ({
  pickDiagnosticReportPath: vi.fn(),
  generateDiagnosticReport: vi.fn(),
}));

import * as gateway from "../gateway";
import { DiagnosticReportSection } from "./DiagnosticReportSection";

describe("DiagnosticReportSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("test_dgr_010_offers_to_generate_a_report", () => {
    render(<DiagnosticReportSection disabled={false} />);
    expect(screen.getByText("Diagnostic report")).toBeInTheDocument();
    expect(document.getElementById("diagnostic-report-generate")).toBeEnabled();
    expect(document.getElementById("diagnostic-report-saved")).toBeNull();
  });

  it("test_dgr_013_is_disabled_while_an_export_or_a_restore_runs", () => {
    render(<DiagnosticReportSection disabled />);
    expect(document.getElementById("diagnostic-report-generate")).toBeDisabled();
  });

  it("test_dgr_014_shows_where_the_report_went_and_its_support_code", async () => {
    vi.mocked(gateway.pickDiagnosticReportPath).mockResolvedValue("/home/me/report.txt");
    vi.mocked(gateway.generateDiagnosticReport).mockResolvedValue({
      success: true,
      data: { support_code: "K7QF-2M4X" },
    });
    render(<DiagnosticReportSection disabled={false} />);

    const button = document.getElementById("diagnostic-report-generate");
    if (!button) throw new Error("generate button missing");
    await userEvent.click(button);

    expect(await screen.findByText("report.txt")).toBeInTheDocument();
    expect(document.getElementById("diagnostic-report-code")).toHaveTextContent("K7QF-2M4X");
  });
});
