import type { DuplicatePair, PatientDuplicatesError } from "@/bindings";

/** Stable identity of a pair, for keys and element ids. */
export function pairId(pair: DuplicatePair): string {
  return `${pair.first.id}-${pair.second.id}`;
}

/** Case and accents ignored, as the backend compares names (PDU-010). */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** PDU-014 — the pairs whose name contains the typed text. */
export function filterPairs(pairs: DuplicatePair[], searchTerm: string): DuplicatePair[] {
  const term = fold(searchTerm.trim());
  if (!term) return pairs;
  return pairs.filter((pair) => fold(pair.name).includes(term));
}

/** PDU-027 — the pair is no longer what the list showed: reload it. */
export function isStalePair(err: PatientDuplicatesError): boolean {
  return err.code === "PatientNotFound" || err.code === "NotACandidatePair";
}

/** PDU-027, PDU-033 — the message for a failed merge or dismissal. */
export function formatDuplicateError(err: PatientDuplicatesError): { key: string } {
  switch (err.code) {
    case "PatientNotFound":
      return { key: "patient:duplicates.error.gone" };
    case "NotACandidatePair":
      return { key: "patient:duplicates.error.not_a_pair" };
    case "SamePatient":
      return { key: "patient:duplicates.error.same_patient" };
    case "MergeFailed":
      return { key: "patient:duplicates.error.merge_failed" };
    default:
      return { key: "patient:duplicates.error.unknown" };
  }
}
