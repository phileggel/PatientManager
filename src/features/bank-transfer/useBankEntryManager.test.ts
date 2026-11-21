import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { makeBankAccount, makeBankEntry } from "@/tests/bank.factory";
import { useBankTransferStore } from "./store";
import { useBankEntryManager } from "./useBankEntryManager";

const account = makeBankAccount({ id: "acc-1", name: "Compte courant" });

describe("useBankEntryManager (#642)", () => {
  beforeEach(() => {
    useBankTransferStore.setState({
      transfers: [
        makeBankEntry({ id: "check", transfer_type: "PATIENT_CHECK", amount: 60000 }),
        makeBankEntry({ id: "cash", transfer_type: "PATIENT_CASH", amount: 25000 }),
        makeBankEntry({
          id: "wire",
          transfer_type: "FUND_WIRE",
          amount: 124050,
          bank_account: account,
        }),
        makeBankEntry({ id: "refund", transfer_type: "FUND_OUTGOING_WIRE", amount: -60000 }),
        makeBankEntry({ id: "refund-check", transfer_type: "PATIENT_CHECK", amount: -30000 }),
      ],
      loading: false,
      error: null,
    });
  });

  it("lists on each page its own kind only, no refund", () => {
    const direct = renderHook(() => useBankEntryManager("direct", "")).result.current;
    const fund = renderHook(() => useBankEntryManager("fund", "")).result.current;

    expect(direct.entries.map((e) => e.id)).toEqual(["check", "cash"]);
    expect(direct.count).toBe(2);
    expect(fund.entries.map((e) => e.id)).toEqual(["wire"]);
  });

  it("searches a direct payment by its method", () => {
    const { result } = renderHook(() => useBankEntryManager("direct", "cash"));

    expect(result.current.entries.map((e) => e.id)).toEqual(["cash"]);
    expect(result.current.count).toBe(1);
  });

  it("searches a fund wire by its account, whatever the case", () => {
    expect(
      renderHook(() => useBankEntryManager("fund", "COMPTE")).result.current.entries,
    ).toHaveLength(1);
    expect(renderHook(() => useBankEntryManager("fund", "livret")).result.current.entries).toEqual(
      [],
    );
  });
});
