import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Patient } from "@/bindings";
import i18n from "@/i18n/config";
import { useCacheStore } from "@/infra/cache/store";
import { makePatient } from "@/tests/patient.factory";
import { useSelectPatientModal } from "./useSelectPatientModal";

function makeTestPatient(id: string, name: string | null, ssn: string): Patient {
  return { ...makePatient(), id, name, ssn };
}

describe("useSelectPatientModal — filter", () => {
  beforeEach(() => {
    useCacheStore.setState({
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
    useCacheStore.setState({ patients: [] });
  });

  it("returns N/A for null date", () => {
    const { result } = renderHook(() => useSelectPatientModal());

    expect(result.current.formatDate(null)).toBe("N/A");
  });

  it("DEBT-052: a missing date reads the translated key, not a literal", () => {
    const key = "transfer.select_patient_modal.na";
    const original = i18n.t(key, { ns: "bank" });
    i18n.addResource("en", "bank", key, "—");
    try {
      const { result } = renderHook(() => useSelectPatientModal());
      expect(result.current.formatDate(null)).toBe("—");
    } finally {
      i18n.addResource("en", "bank", key, original);
    }
  });

  it("formats a valid ISO date as a localised string", () => {
    const { result } = renderHook(() => useSelectPatientModal());

    const formatted = result.current.formatDate("2025-01-15");
    expect(formatted).toMatch(/15/);
    expect(formatted).toMatch(/2025/);
  });
});
