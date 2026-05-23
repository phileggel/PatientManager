import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCacheStore } from "@/infra/cache/store";
import { makeProcedureType } from "@/tests/procedure.factory";
import { RESERVED_PROCEDURE_TYPE_ID } from "../shared/types";
import { useProcedureTypeList } from "./useProcedureTypeList";

vi.mock("../gateway", () => ({
  deleteProcedureType: vi.fn(),
  reloadProcedureTypes: vi.fn(),
}));

import { deleteProcedureType, reloadProcedureTypes } from "../gateway";

const mockDelete = vi.mocked(deleteProcedureType);
const mockReload = vi.mocked(reloadProcedureTypes);

describe("useProcedureTypeList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCacheStore.setState({
      procedureTypes: [],
      procedureTypesError: null,
      procedureTypesLoading: false,
    });
  });

  it("excludes the reserved procedure type from visible rows", () => {
    const reserved = makeProcedureType({ id: RESERVED_PROCEDURE_TYPE_ID, name: "Import PDF" });
    const normal = makeProcedureType({ id: "pt-1", name: "Consultation" });
    useCacheStore.setState({ procedureTypes: [reserved, normal] });

    const { result } = renderHook(() => useProcedureTypeList());

    expect(result.current.procedureTypes).toHaveLength(1);
    expect(result.current.procedureTypes[0]?.id).toBe("pt-1");
  });

  it("retry updates store and clears error on success", async () => {
    const types = [makeProcedureType({ id: "pt-1", name: "Consultation" })];
    mockReload.mockResolvedValue({ success: true, data: types });
    useCacheStore.setState({ procedureTypesError: "previous error" });

    const { result } = renderHook(() => useProcedureTypeList());

    await act(async () => {
      await result.current.retry();
    });

    expect(useCacheStore.getState().procedureTypes).toEqual(types);
    expect(useCacheStore.getState().procedureTypesError).toBeNull();
  });

  it("retry sets error and keeps existing data on failure", async () => {
    mockReload.mockResolvedValue({ success: false, error: "network error" });

    const { result } = renderHook(() => useProcedureTypeList());

    await act(async () => {
      await result.current.retry();
    });

    expect(useCacheStore.getState().procedureTypesError).toBe("network error");
  });

  it("deleteProcedureType resolves without throwing when gateway returns success=true", async () => {
    mockDelete.mockResolvedValue({ success: true, data: undefined });

    const { result } = renderHook(() => useProcedureTypeList());

    await expect(result.current.deleteProcedureType("pt-1")).resolves.toBeUndefined();
  });

  it("deleteProcedureType throws when gateway returns success=false", async () => {
    mockDelete.mockResolvedValue({ success: false, error: "Type in use" });

    const { result } = renderHook(() => useProcedureTypeList());

    await expect(result.current.deleteProcedureType("pt-1")).rejects.toThrow("Type in use");
  });
});
