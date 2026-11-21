import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeBankEntry } from "@/tests/bank.factory";
import { toastService } from "@/ui/components/snackbar";

const deleteTransfer = vi.fn();

vi.mock("./useBankTransferOperations", () => ({
  useBankTransferOperations: () => ({ isLoading: false, error: null, deleteTransfer }),
}));
// The windows read the backend; their own tests cover them.
vi.mock("./add_bank_transfer_form/AddBankTransferModal", () => ({
  AddBankTransferModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="add-window" /> : null,
}));
vi.mock("./edit_bank_transfer_modal/EditBankTransferModal", () => ({
  EditBankTransferModal: () => null,
}));

import { BankEntryManager } from "./BankEntryManager";
import { useBankTransferStore } from "./store";

const check = makeBankEntry({
  id: "check",
  transfer_date: "2026-11-17",
  amount: 60000,
  transfer_type: "PATIENT_CHECK",
});

describe("BankEntryManager (#642)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBankTransferStore.setState({ transfers: [check], loading: false, error: null });
  });

  it("opens the add window from its (+)", async () => {
    render(<BankEntryManager kind="direct" />);

    await userEvent.click(document.getElementById("fab-create-direct-payment") as HTMLElement);

    expect(screen.getByTestId("add-window")).toBeInTheDocument();
  });

  it("deletes a payment once the deletion is confirmed (R5)", async () => {
    deleteTransfer.mockResolvedValue({ success: true, data: undefined });
    render(<BankEntryManager kind="direct" />);

    await userEvent.click(document.getElementById("direct-payment-delete-check") as HTMLElement);
    expect(deleteTransfer).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteTransfer).toHaveBeenCalledWith(check));
    expect(toastService.show).toHaveBeenCalledWith("success", "Payment deleted");
  });

  it("deletes nothing when the deletion is cancelled (R5)", async () => {
    render(<BankEntryManager kind="direct" />);

    await userEvent.click(document.getElementById("direct-payment-delete-check") as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteTransfer).not.toHaveBeenCalled();
  });
});
