import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type ProcedureRefundInfo } from "@/bindings";
import {
  cancelOverpayment,
  createOverpayment,
  getProcedureRefundByRefundProcedure,
  getProcedureRefundBySource,
} from "./gateway";

/**
 * Gateway pass-through contract (F27): the gateway is a typed-error forwarder.
 * It MUST NOT transform, translate, or drop fields. These tests pin that
 * contract: the typed OverpaymentError from the Tauri command surfaces verbatim
 * inside ServiceResult.error, and the success branch returns data unchanged.
 */
vi.mock("@/bindings", async () => {
  const actual = await vi.importActual<typeof import("@/bindings")>("@/bindings");
  return {
    ...actual,
    commands: {
      createOverpayment: vi.fn(),
      cancelOverpayment: vi.fn(),
      getProcedureRefundBySource: vi.fn(),
      getProcedureRefundByRefundProcedure: vi.fn(),
    },
  };
});

const SAMPLE_REFUND_INFO: ProcedureRefundInfo = {
  id: "refund-1",
  source_procedure_id: "source-proc-1",
  refund_procedure_id: "refund-proc-1",
  refund_date: "2024-03-01",
  reason: null,
  previous_payment_status: "FUND_PAID",
};

describe("createOverpayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the typed error verbatim when the command returns error", async () => {
    vi.mocked(commands.createOverpayment).mockResolvedValue({
      status: "error",
      error: { code: "SourceNotRefundable" },
    });
    const result = await createOverpayment({
      source_procedure_id: "proc-1",
      refund_date: "2024-03-01",
      transfer_type: "Check",
      bank_account_id: "account-1",
      reason: null,
    });
    expect(result).toEqual({ success: false, error: { code: "SourceNotRefundable" } });
  });

  it("returns success with null data on ok", async () => {
    vi.mocked(commands.createOverpayment).mockResolvedValue({ status: "ok", data: null });
    const result = await createOverpayment({
      source_procedure_id: "proc-1",
      refund_date: "2024-03-01",
      transfer_type: "Check",
      bank_account_id: "account-1",
      reason: null,
    });
    expect(result).toEqual({ success: true, data: null });
  });

  it("forwards DatabaseError typed error (BC collision arm)", async () => {
    vi.mocked(commands.createOverpayment).mockResolvedValue({
      status: "error",
      error: { code: "DatabaseError" },
    });
    const result = await createOverpayment({
      source_procedure_id: "proc-1",
      refund_date: "2024-03-01",
      transfer_type: "Check",
      bank_account_id: "account-1",
      reason: null,
    });
    expect(result).toEqual({ success: false, error: { code: "DatabaseError" } });
  });
});

describe("cancelOverpayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the typed error verbatim when the command returns error", async () => {
    vi.mocked(commands.cancelOverpayment).mockResolvedValue({
      status: "error",
      error: { code: "RefundRecordNotFound" },
    });
    const result = await cancelOverpayment({ source_procedure_id: "proc-1" });
    expect(result).toEqual({ success: false, error: { code: "RefundRecordNotFound" } });
  });

  it("returns success with null data on ok", async () => {
    vi.mocked(commands.cancelOverpayment).mockResolvedValue({ status: "ok", data: null });
    const result = await cancelOverpayment({ source_procedure_id: "proc-1" });
    expect(result).toEqual({ success: true, data: null });
  });
});

describe("getProcedureRefundBySource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the typed error verbatim", async () => {
    vi.mocked(commands.getProcedureRefundBySource).mockResolvedValue({
      status: "error",
      error: { code: "DatabaseError" },
    });
    const result = await getProcedureRefundBySource("proc-1");
    expect(result).toEqual({ success: false, error: { code: "DatabaseError" } });
  });

  it("returns success with the refund info unchanged on ok", async () => {
    vi.mocked(commands.getProcedureRefundBySource).mockResolvedValue({
      status: "ok",
      data: SAMPLE_REFUND_INFO,
    });
    const result = await getProcedureRefundBySource("proc-1");
    expect(result).toEqual({ success: true, data: SAMPLE_REFUND_INFO });
  });

  it("returns null data when no refund exists for the source", async () => {
    vi.mocked(commands.getProcedureRefundBySource).mockResolvedValue({
      status: "ok",
      data: null,
    });
    const result = await getProcedureRefundBySource("proc-1");
    expect(result).toEqual({ success: true, data: null });
  });
});

describe("getProcedureRefundByRefundProcedure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the typed error verbatim", async () => {
    vi.mocked(commands.getProcedureRefundByRefundProcedure).mockResolvedValue({
      status: "error",
      error: { code: "DatabaseError" },
    });
    const result = await getProcedureRefundByRefundProcedure("refund-proc-1");
    expect(result).toEqual({ success: false, error: { code: "DatabaseError" } });
  });

  it("returns the refund info unchanged on ok", async () => {
    vi.mocked(commands.getProcedureRefundByRefundProcedure).mockResolvedValue({
      status: "ok",
      data: SAMPLE_REFUND_INFO,
    });
    const result = await getProcedureRefundByRefundProcedure("refund-proc-1");
    expect(result).toEqual({ success: true, data: SAMPLE_REFUND_INFO });
  });
});
