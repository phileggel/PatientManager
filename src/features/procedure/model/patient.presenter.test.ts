import { describe, expect, it } from "vitest";
import { formatPatientLabel } from "./patient.presenter";

describe("formatPatientLabel", () => {
  it("returns name with SSN in parentheses when SSN is present", () => {
    expect(formatPatientLabel({ name: "DUPONT Floriane", ssn: "1234567890123" })).toBe(
      "DUPONT Floriane (1234567890123)",
    );
  });

  it("returns name only when SSN is null", () => {
    expect(formatPatientLabel({ name: "DUPONT Floriane", ssn: null })).toBe("DUPONT Floriane");
  });

  it("returns name only when SSN is empty string", () => {
    expect(formatPatientLabel({ name: "DUPONT Floriane", ssn: "" })).toBe("DUPONT Floriane");
  });

  it("returns fallback dash when name is null and SSN present", () => {
    expect(formatPatientLabel({ name: null, ssn: "1234567890123" })).toBe("— (1234567890123)");
  });

  it("returns fallback dash when name and SSN are both null", () => {
    expect(formatPatientLabel({ name: null, ssn: null })).toBe("—");
  });
});
