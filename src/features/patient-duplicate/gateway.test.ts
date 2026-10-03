import { beforeEach, describe, expect, it, vi } from "vitest";

const mockList = vi.hoisted(() => vi.fn());
const mockMerge = vi.hoisted(() => vi.fn());
const mockDismiss = vi.hoisted(() => vi.fn());
vi.mock("@/bindings", () => ({
  commands: {
    listPatientDuplicates: mockList,
    mergePatients: mockMerge,
    dismissPatientDuplicate: mockDismiss,
  },
}));
vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { dismissPatientDuplicate, listPatientDuplicates, mergePatients } from "./gateway";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("patient-duplicate/gateway", () => {
  it("test_pdu_010_lists_the_pairs", async () => {
    mockList.mockResolvedValue({ status: "ok", data: [] });
    expect(await listPatientDuplicates()).toEqual({ success: true, data: [] });
  });

  it("passes a list failure through", async () => {
    mockList.mockResolvedValue({ status: "error", error: { code: "DatabaseError" } });
    expect(await listPatientDuplicates()).toEqual({
      success: false,
      error: { code: "DatabaseError" },
    });
  });

  it("test_pdu_021_merges_the_other_patient_into_the_kept_one", async () => {
    mockMerge.mockResolvedValue({ status: "ok", data: null });
    expect(await mergePatients("kept", "other")).toEqual({ success: true, data: undefined });
    expect(mockMerge).toHaveBeenCalledWith("kept", "other");
  });

  it("test_pdu_025_passes_a_refused_merge_through", async () => {
    mockMerge.mockResolvedValue({ status: "error", error: { code: "NotACandidatePair" } });
    expect(await mergePatients("kept", "other")).toEqual({
      success: false,
      error: { code: "NotACandidatePair" },
    });
  });

  it("test_pdu_030_dismisses_the_pair", async () => {
    mockDismiss.mockResolvedValue({ status: "ok", data: null });
    expect(await dismissPatientDuplicate("a", "b")).toEqual({ success: true, data: undefined });
    expect(mockDismiss).toHaveBeenCalledWith("a", "b");
  });

  it("test_pdu_032_passes_a_refused_dismissal_through", async () => {
    mockDismiss.mockResolvedValue({ status: "error", error: { code: "PatientNotFound" } });
    expect(await dismissPatientDuplicate("a", "gone")).toEqual({
      success: false,
      error: { code: "PatientNotFound" },
    });
  });
});
