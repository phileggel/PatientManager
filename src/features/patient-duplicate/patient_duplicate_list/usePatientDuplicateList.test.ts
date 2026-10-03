import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DuplicatePair } from "@/bindings";
import { toastService } from "@/ui/components/snackbar";
import * as gateway from "../gateway";
import { usePatientDuplicateList } from "./usePatientDuplicateList";

vi.mock("../gateway");

const PAIR: DuplicatePair = {
  name: "Martin Claire",
  first: {
    id: "a",
    name: "Martin Claire",
    ssn: null,
    procedure_count: 2,
    latest_procedure_date: "2026-03-10",
  },
  second: {
    id: "b",
    name: "Martin Claire",
    ssn: null,
    procedure_count: 0,
    latest_procedure_date: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(gateway.listPatientDuplicates).mockResolvedValue({ success: true, data: [PAIR] });
});

async function loaded() {
  const hook = renderHook(() => usePatientDuplicateList());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("usePatientDuplicateList", () => {
  it("test_pdu_015_loads_the_pairs_and_leaves_the_loading_state", async () => {
    const { result } = renderHook(() => usePatientDuplicateList());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pairs).toEqual([PAIR]);
    expect(result.current.loadFailed).toBe(false);
  });

  it("test_pdu_015_a_load_failure_is_reported", async () => {
    vi.mocked(gateway.listPatientDuplicates).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });
    const { result } = renderHook(() => usePatientDuplicateList());
    await waitFor(() => expect(result.current.loadFailed).toBe(true));
  });

  it("test_pdu_027_a_successful_merge_confirms_and_reloads", async () => {
    vi.mocked(gateway.mergePatients).mockResolvedValue({ success: true, data: undefined });
    const { result } = await loaded();

    let done = false;
    await act(async () => {
      done = await result.current.merge("a", "b");
    });

    expect(done).toBe(true);
    expect(gateway.mergePatients).toHaveBeenCalledWith("a", "b");
    expect(toastService.show).toHaveBeenCalledWith("success", expect.any(String));
    expect(gateway.listPatientDuplicates).toHaveBeenCalledTimes(2);
  });

  it("test_pdu_027_a_failed_merge_is_reported_and_the_list_stays", async () => {
    vi.mocked(gateway.mergePatients).mockResolvedValue({
      success: false,
      error: { code: "MergeFailed" },
    });
    const { result } = await loaded();

    let done = true;
    await act(async () => {
      done = await result.current.merge("a", "b");
    });

    expect(done).toBe(false);
    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
    expect(gateway.listPatientDuplicates).toHaveBeenCalledTimes(1);
  });

  it("test_pdu_027_a_pair_that_no_longer_exists_reloads_the_list", async () => {
    vi.mocked(gateway.mergePatients).mockResolvedValue({
      success: false,
      error: { code: "PatientNotFound" },
    });
    const { result } = await loaded();

    await act(async () => {
      await result.current.merge("a", "b");
    });

    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
    expect(gateway.listPatientDuplicates).toHaveBeenCalledTimes(2);
  });

  it("test_pdu_033_a_dismissal_reloads_the_list_without_a_toast", async () => {
    vi.mocked(gateway.dismissPatientDuplicate).mockResolvedValue({
      success: true,
      data: undefined,
    });
    const { result } = await loaded();

    await act(() => result.current.dismiss(PAIR));

    expect(gateway.dismissPatientDuplicate).toHaveBeenCalledWith("a", "b");
    expect(toastService.show).not.toHaveBeenCalled();
    expect(gateway.listPatientDuplicates).toHaveBeenCalledTimes(2);
  });

  it("test_pdu_033_a_failed_dismissal_is_reported", async () => {
    vi.mocked(gateway.dismissPatientDuplicate).mockResolvedValue({
      success: false,
      error: { code: "DatabaseError" },
    });
    const { result } = await loaded();

    await act(() => result.current.dismiss(PAIR));

    expect(toastService.show).toHaveBeenCalledWith("error", expect.any(String));
    expect(gateway.listPatientDuplicates).toHaveBeenCalledTimes(1);
  });
});
