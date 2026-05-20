import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/formatters";
import { FundPaymentList } from "./FundPaymentList";

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

import { makeFundPaymentGroup } from "@/tests/fund-payment.factory";
import { useFundPaymentList } from "./useFundPaymentList";

const makeGroup = (id: string, isLocked: boolean) =>
  makeFundPaymentGroup({ id, payment_date: "2026-03-01", is_locked: isLocked });

const makeRow = (
  id: string,
  isLocked: boolean,
  range?: { startDate: string | undefined; endDate: string | undefined },
) => ({
  rowId: `row-${id}`,
  id,
  fundId: "fund-1",
  fundName: "CPAM - Test",
  paymentDate: "2026-03-01",
  procedureStartDate: range?.startDate,
  procedureEndDate: range?.endDate,
  totalAmount: 150000,
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

  it("renders totalAmount with locale-aware currency, never raw thousandths or bare numbers", () => {
    vi.mocked(useFundPaymentList).mockReturnValue({
      fundPaymentRows: [makeRow("g1", false)],
      groups: [makeGroup("g1", false)],
      loading: false,
      deleteGroup: vi.fn(),
    });

    render(<FundPaymentList />);

    // Test setup pins i18n locale to en-GB → `€150.00`. Comparing to the
    // helper's own output keeps the assertion locale-aware.
    expect(screen.getByText(formatCurrency(150000, "en-GB"))).toBeInTheDocument();
    // No raw thousandths leak
    expect(screen.queryByText("150000")).not.toBeInTheDocument();
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

    it("shows an enabled view button for a locked group", () => {
      render(<FundPaymentList />);
      const viewButton = screen.getByRole("button", { name: /view payment for CPAM - Test/i });
      expect(viewButton).not.toBeDisabled();
    });

    it("disables the delete button for a locked group", () => {
      render(<FundPaymentList />);
      const deleteButton = screen.getByRole("button", { name: /delete payment for CPAM - Test/i });
      expect(deleteButton).toBeDisabled();
    });
  });

  describe("FPM-360 — care-period range in date cell", () => {
    it("renders 'start → end' when range spans multiple dates", () => {
      vi.mocked(useFundPaymentList).mockReturnValue({
        fundPaymentRows: [makeRow("g1", false, { startDate: "2026-01-15", endDate: "2026-02-28" })],
        groups: [makeGroup("g1", false)],
        loading: false,
        deleteGroup: vi.fn(),
      });

      render(<FundPaymentList />);

      // Test setup pins i18n locale to en-GB → DD/MM/YYYY format.
      expect(screen.getByText(/15\/01\/2026.*→.*28\/02\/2026/)).toBeInTheDocument();
    });

    it("renders a single date when start equals end", () => {
      vi.mocked(useFundPaymentList).mockReturnValue({
        fundPaymentRows: [makeRow("g1", false, { startDate: "2026-01-15", endDate: "2026-01-15" })],
        groups: [makeGroup("g1", false)],
        loading: false,
        deleteGroup: vi.fn(),
      });

      render(<FundPaymentList />);

      expect(screen.getByText("15/01/2026")).toBeInTheDocument();
      // No arrow when collapsed to a single date
      expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    });

    it("renders a dash when no procedure dates resolved", () => {
      vi.mocked(useFundPaymentList).mockReturnValue({
        fundPaymentRows: [makeRow("g1", false, { startDate: undefined, endDate: undefined })],
        groups: [makeGroup("g1", false)],
        loading: false,
        deleteGroup: vi.fn(),
      });

      render(<FundPaymentList />);

      expect(screen.getByText("—")).toBeInTheDocument();
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
