import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Patient } from "@/bindings";
import { useAppStore } from "@/lib/appStore";
import { makePatient } from "@/tests/patient.factory";
import { useSelectPatientModal } from "./useSelectPatientModal";

function makeTestPatient(id: string, name: string | null, ssn: string): Patient {
  return { ...makePatient(), id, name, ssn };
}

describe("useSelectPatientModal — filter", () => {
  beforeEach(() => {
    useAppStore.setState({
      patients: [
        makeTestPatient("p-1", "Dupont Jean", "111456789"),
        makeTestPatient("p-2", "Martin Alice", "222789012"),
        makeTestPatient("p-3", null, "333999888"),
      ],
    });
  });

  it("returns all patients when search term is empty", () => {
    const { result } = renderHook(() => useSelectPatientModal());

    expect(result.current.filteredPatients).toHaveLength(3);
  });

  it("filters by patient name (case-insensitive)", () => {
    const { result } = renderHook(() => useSelectPatientModal());

    act(() => result.current.setSearchTerm("dupont"));

    expect(result.current.filteredPatients).toHaveLength(1);
    expect(result.current.filteredPatients[0]?.id).toBe("p-1");
  });

  it("filters by ssn substring", () => {
    const { result } = renderHook(() => useSelectPatientModal());

    act(() => result.current.setSearchTerm("222"));

    expect(result.current.filteredPatients).toHaveLength(1);
    expect(result.current.filteredPatients[0]?.id).toBe("p-2");
  });

  it("patient with null name is matched by ssn", () => {
    const { result } = renderHook(() => useSelectPatientModal());

    act(() => result.current.setSearchTerm("333"));

    expect(result.current.filteredPatients).toHaveLength(1);
    expect(result.current.filteredPatients[0]?.id).toBe("p-3");
  });

  it("whitespace-only search returns all patients", () => {
    const { result } = renderHook(() => useSelectPatientModal());

    act(() => result.current.setSearchTerm("  "));

    expect(result.current.filteredPatients).toHaveLength(3);
  });
});

describe("useSelectPatientModal — formatDate", () => {
  beforeEach(() => {
    useAppStore.setState({ patients: [] });
  });

  it("returns N/A for null date", () => {
    const { result } = renderHook(() => useSelectPatientModal());

    expect(result.current.formatDate(null)).toBe("N/A");
  });

  it("formats a valid ISO date as a localised string", () => {
    const { result } = renderHook(() => useSelectPatientModal());

    const formatted = result.current.formatDate("2025-01-15");
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/2025/);
  });
});
