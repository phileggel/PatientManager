import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AutoCorrection, NormalizedPdfLine } from "@/bindings";
import { buildNotFoundKey } from "../../shared/utils";
import { NotFoundCard } from "./NotFoundCard";

vi.mock("../../gateway", () => ({ checkSplitIntoProcedures: vi.fn() }));

const line: NormalizedPdfLine = {
  line_index: 4,
  payment_date: "2026-10-05",
  invoice_number: "F-1",
  fund_name: "CPAM 931",
  patient_name: "DOE JOHN",
  ssn: "1234567890123",
  nature: "SEANCE",
  procedure_start_date: "2026-09-01",
  procedure_end_date: "2026-09-30",
  is_period: true,
  amount: 135000,
};

const baseProps = {
  line,
  nearbyCandidates: [],
  acceptedKeys: new Set<string>(),
  autoCorrections: new Map<string, AutoCorrection>(),
  onAcceptCorrection: vi.fn(),
};

describe("NotFoundCard — split into procedures", () => {
  it("FPA-251: offers the split beside the single creation, and opens the editor in the card", () => {
    render(<NotFoundCard {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Split into several procedures" }));

    expect(screen.getByRole("button", { name: "Validate the split" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create/ })).not.toBeInTheDocument();
  });

  it("FPA-254C: an accepted split says how many procedures it will create", () => {
    const key = buildNotFoundKey(line);
    const split: AutoCorrection = {
      SplitIntoProcedures: {
        line,
        parts: [
          { procedure_date: "2026-09-04", billed_amount: 45000 },
          { procedure_date: "2026-09-11", billed_amount: 90000 },
        ],
      },
    };

    render(
      <NotFoundCard
        {...baseProps}
        acceptedKeys={new Set([key])}
        autoCorrections={new Map([[key, split]])}
      />,
    );

    expect(screen.getByText("2 procedures will be created")).toBeInTheDocument();
  });

  it("FPA-254C: a split of one part reads in the singular", () => {
    const key = buildNotFoundKey(line);
    const split: AutoCorrection = {
      SplitIntoProcedures: {
        line,
        parts: [{ procedure_date: "2026-09-04", billed_amount: 135000 }],
      },
    };
    render(
      <NotFoundCard
        {...baseProps}
        acceptedKeys={new Set([key])}
        autoCorrections={new Map([[key, split]])}
      />,
    );
    expect(screen.getByText("1 procedure will be created")).toBeInTheDocument();
  });

  it("FPA-254D: a card resolved another way closes its open editor", () => {
    const key = buildNotFoundKey(line);
    const { rerender } = render(<NotFoundCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Split into several procedures" }));

    rerender(
      <NotFoundCard
        {...baseProps}
        acceptedKeys={new Set([key])}
        autoCorrections={
          new Map([
            [
              key,
              {
                CreateProcedure: {
                  ssn: line.ssn,
                  patient_name: line.patient_name,
                  procedure_date: line.procedure_start_date,
                  payment_date: line.payment_date,
                  billed_amount: line.amount,
                  pdf_fund_label: line.fund_name,
                },
              },
            ],
          ])
        }
      />,
    );
    rerender(<NotFoundCard {...baseProps} />);

    expect(screen.queryByRole("button", { name: "Validate the split" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Split into several procedures" }),
    ).toBeInTheDocument();
  });

  it("FPA-254C: a check that accepts the split stages it under the line's key", async () => {
    const gateway = await import("../../gateway");
    vi.mocked(gateway.checkSplitIntoProcedures).mockResolvedValue({ success: true, data: null });
    const onAcceptCorrection = vi.fn();
    render(<NotFoundCard {...baseProps} onAcceptCorrection={onAcceptCorrection} />);
    fireEvent.click(screen.getByRole("button", { name: "Split into several procedures" }));

    fireEvent.click(screen.getByRole("button", { name: "Validate the split" }));

    await vi.waitFor(() =>
      expect(onAcceptCorrection).toHaveBeenCalledWith(buildNotFoundKey(line), {
        SplitIntoProcedures: {
          line,
          parts: [{ procedure_date: line.procedure_start_date, billed_amount: null }],
        },
      }),
    );
  });

  it("FPA-254D: Cancel closes the editor and tells the parent", () => {
    const onSplittingChange = vi.fn();
    render(<NotFoundCard {...baseProps} onSplittingChange={onSplittingChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Split into several procedures" }));
    expect(onSplittingChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Validate the split" })).not.toBeInTheDocument();
    expect(onSplittingChange).toHaveBeenLastCalledWith(false);
  });

  it("FPA-254A: a refused split shows its translated messages in the editor", async () => {
    const gateway = await import("../../gateway");
    vi.mocked(gateway.checkSplitIntoProcedures).mockResolvedValue({
      success: false,
      error: { code: "SplitInvalid", reasons: ["TotalMismatch"], parts: [["DateOutOfRange"]] },
    });
    render(<NotFoundCard {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Split into several procedures" }));

    fireEvent.click(screen.getByRole("button", { name: "Validate the split" }));

    expect(
      await screen.findByText("The amounts do not add up to the line's amount."),
    ).toBeInTheDocument();
    expect(screen.getByText("The date must be within the line's period.")).toBeInTheDocument();
  });
});
