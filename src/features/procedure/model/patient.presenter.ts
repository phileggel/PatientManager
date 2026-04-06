/**
 * formatPatientLabel — R28, R31
 *
 * Returns "NOM Prénom (INS)" when SSN is present, "NOM Prénom" otherwise.
 * Used in ComboboxField items, selected value display, and read-only patient
 * text in view-partial mode.
 */
export function formatPatientLabel(patient: { name: string | null; ssn: string | null }): string {
  const name = patient.name ?? "—";
  if (patient.ssn) return `${name} (${patient.ssn})`;
  return name;
}
