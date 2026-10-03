import { describe, expect, it } from "vitest";
import type { DuplicatePair } from "@/bindings";
import {
  filterPairs,
  formatDuplicateError,
  hasDifferentSsn,
  isStalePair,
  pairId,
} from "./presenter";

function pair(name: string, firstId: string, secondId: string): DuplicatePair {
  const summary = (id: string) => ({
    id,
    name,
    ssn: null,
    procedure_count: 0,
    latest_procedure_date: null,
  });
  return { name, first: summary(firstId), second: summary(secondId) };
}

describe("patient-duplicate/presenter", () => {
  it("test_pdu_014_keeps_the_pairs_whose_name_contains_the_text_ignoring_case_and_accents", () => {
    const pairs = [pair("Dubois Élodie", "a", "b"), pair("Martin Claire", "c", "d")];
    expect(filterPairs(pairs, "elod").map((p) => p.name)).toEqual(["Dubois Élodie"]);
    expect(filterPairs(pairs, "  MARTIN ").map((p) => p.name)).toEqual(["Martin Claire"]);
    expect(filterPairs(pairs, "")).toEqual(pairs);
    expect(filterPairs(pairs, "zzz")).toEqual([]);
  });

  it("test_pdu_029_two_different_ssn_are_flagged_and_a_missing_or_equal_one_is_not", () => {
    const withSsn = (first: string | null, second: string | null): DuplicatePair => {
      const base = pair("Martin", "a", "b");
      return {
        ...base,
        first: { ...base.first, ssn: first },
        second: { ...base.second, ssn: second },
      };
    };
    expect(hasDifferentSsn(withSsn("1111111111111", "2222222222222"))).toBe(true);
    expect(hasDifferentSsn(withSsn("1111111111111", "1111111111111"))).toBe(false);
    expect(hasDifferentSsn(withSsn("1111111111111", null))).toBe(false);
    expect(hasDifferentSsn(withSsn(null, null))).toBe(false);
    expect(hasDifferentSsn(withSsn("1111111111111", "  "))).toBe(false);
  });

  it("names a pair by its two patients", () => {
    expect(pairId(pair("Martin", "a", "b"))).toBe("a-b");
  });

  it("test_pdu_027_a_pair_that_no_longer_exists_is_stale", () => {
    expect(isStalePair({ code: "PatientNotFound" })).toBe(true);
    expect(isStalePair({ code: "NotACandidatePair" })).toBe(true);
    expect(isStalePair({ code: "MergeFailed" })).toBe(false);
    expect(isStalePair({ code: "DatabaseError" })).toBe(false);
  });

  it("test_pdu_027_maps_every_code_to_its_message", () => {
    expect(formatDuplicateError({ code: "PatientNotFound" }).key).toBe(
      "patient:duplicates.error.gone",
    );
    expect(formatDuplicateError({ code: "NotACandidatePair" }).key).toBe(
      "patient:duplicates.error.not_a_pair",
    );
    expect(formatDuplicateError({ code: "SamePatient" }).key).toBe(
      "patient:duplicates.error.same_patient",
    );
    expect(formatDuplicateError({ code: "MergeFailed" }).key).toBe(
      "patient:duplicates.error.merge_failed",
    );
    expect(formatDuplicateError({ code: "DatabaseError" }).key).toBe(
      "patient:duplicates.error.unknown",
    );
  });
});
