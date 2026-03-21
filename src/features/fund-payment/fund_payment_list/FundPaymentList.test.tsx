import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FundPaymentList from "./FundPaymentList";

vi.mock("./useFundPaymentList", () => ({
  useFundPaymentList: vi.fn(),
}));

vi.mock("../edit_fund_payment_modal/EditFundPaymentModal", () => ({
  EditFundPaymentModal: () => null,
}));

interface ConfirmationDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
}

vi.mock("@ui/components", async () => {
  const actual = await vi.importActual("@ui/components");
  return {
    ...actual,
    ConfirmationDialog: ({ isOpen, title }: ConfirmationDialogProps) =>
      isOpen ? <div data-testid="confirmation-dialog">{title}</div> : null,
  };
});

import { useFundPaymentList } from "./useFundPaymentList";

const makeGroup = (id: string, isLocked: boolean) => ({
  id,
  fund_id: "fund-1",
  payment_date: "2026-03-01",
  total_amount: 150000,
  lines: [{ id: "line-1", fund_payment_group_id: id, procedure_id: "proc-1" }],
  status: "ACTIVE" as const,
  is_locked: isLocked,
});

const makeRow = (id: string, isLocked: boolean) => ({
  rowId: `row-${id}`,
  id,
  fundId: "fund-1",
  fundName: "CPAM - Test",
  paymentDate: "2026-03-01",
  totalAmount: 150,
  procedureCount: 1,
  isLocked,
});

describe("FundPaymentList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders rows in loading state", () => {
    vi.mocked(useFundPaymentList).mockReturnValue({
      fundPaymentRows: [],
      groups: [],
      loading: true,
      deleteGroup: vi.fn(),
    });

    render(<FundPaymentList />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders fund payment rows", () => {
    vi.mocked(useFundPaymentList).mockReturnValue({
      fundPaymentRows: [makeRow("g1", false)],
      groups: [makeGroup("g1", false)],
      loading: false,
      deleteGroup: vi.fn(),
    });

    render(<FundPaymentList />);

    expect(screen.getByText("CPAM - Test")).toBeInTheDocument();
  });

  describe("R18 — locked group visual feedback", () => {
    beforeEach(() => {
      vi.mocked(useFundPaymentList).mockReturnValue({
        fundPaymentRows: [makeRow("g1", true)],
        groups: [makeGroup("g1", true)],
        loading: false,
        deleteGroup: vi.fn(),
      });
    });

    it("shows lock icon for locked group", () => {
      render(<FundPaymentList />);
      // Lock icon renders as an SVG inside the fund name cell
      const fundNameCell = screen.getByText("CPAM - Test").closest("td");
      expect(fundNameCell?.querySelector("svg")).toBeInTheDocument();
    });

    it("disables the edit button for a locked group", () => {
      render(<FundPaymentList />);
      const editButton = screen.getByRole("button", { name: /edit payment for CPAM - Test/i });
      expect(editButton).toBeDisabled();
    });

    it("disables the delete button for a locked group", () => {
      render(<FundPaymentList />);
      const deleteButton = screen.getByRole("button", { name: /delete payment for CPAM - Test/i });
      expect(deleteButton).toBeDisabled();
    });
  });

  describe("unlocked group buttons", () => {
    beforeEach(() => {
      vi.mocked(useFundPaymentList).mockReturnValue({
        fundPaymentRows: [makeRow("g1", false)],
        groups: [makeGroup("g1", false)],
        loading: false,
        deleteGroup: vi.fn(),
      });
    });

    it("enables the edit button for an unlocked group", () => {
      render(<FundPaymentList />);
      const editButton = screen.getByRole("button", { name: /edit payment for CPAM - Test/i });
      expect(editButton).not.toBeDisabled();
    });

    it("enables the delete button for an unlocked group", () => {
      render(<FundPaymentList />);
      const deleteButton = screen.getByRole("button", {
        name: /delete payment for CPAM - Test/i,
      });
      expect(deleteButton).not.toBeDisabled();
    });
  });
});
