import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeFund } from "@/tests/fund.factory";
import type { BankStatementLabelRow } from "../shared/presenter";
import { EditBankStatementLabelModal } from "./EditBankStatementLabelModal";

const ROW: BankStatementLabelRow = {
  id: "m1",
  accountName: "Compte courant",
  label: "VIR CPAM",
  fundId: "fund-1",
  assignment: { kind: "fund", fundName: "CPAM 75" },
};

beforeEach(() => {
  useCacheStore.setState({
    funds: [
      makeFund({ id: "fund-1", name: "CPAM 75" }),
      makeFund({ id: "fund-2", name: "CPAM 93" }),
    ],
  });
});

describe("EditBankStatementLabelModal", () => {
  it("test_bas_042a_offers_ignored_first_then_the_active_funds", () => {
    render(<EditBankStatementLabelModal row={ROW} onSubmit={vi.fn()} onClose={vi.fn()} />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["— Ignore this label —", "CPAM 75", "CPAM 93"]);
  });

  it("test_bas_042_submits_another_fund_or_ignored", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<EditBankStatementLabelModal row={ROW} onSubmit={onSubmit} onClose={vi.fn()} />);
    const select = document.getElementById("edit-bank-statement-label-fund") as HTMLSelectElement;
    const submit = document.getElementById("edit-bank-statement-label-submit") as HTMLButtonElement;

    await user.selectOptions(select, "fund-2");
    await user.click(submit);
    expect(onSubmit).toHaveBeenLastCalledWith("m1", { type: "Fund", fund_id: "fund-2" });

    await user.selectOptions(select, "ignored");
    await user.click(submit);
    expect(onSubmit).toHaveBeenLastCalledWith("m1", { type: "Rejected" });
  });
});
