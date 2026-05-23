import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Fund, FundLabelResolution } from "@/bindings";
import { useCacheStore } from "@/infra/cache/store";
import { FundLabelMappingStep } from "./FundLabelMappingStep";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "labelMapping.title": "Associations labels → organismes",
        "labelMapping.description": "Description",
        "labelMapping.accept": "Accepter",
        "labelMapping.saving": "Enregistrement...",
        "labelMapping.selectPlaceholder": "-- Sélectionner --",
        "labelMapping.rejected": "REJETÉ",
        "labelMapping.fundsGroup": "Organismes",
        "labelMapping.sectionUnknown": "Labels inconnus",
        "labelMapping.sectionConfirmed": "Labels déjà enregistrés",
        "labelMapping.empty": "Aucun label.",
      };
      if (key === "labelMapping.fundAriaLabel" && opts) return `Organisme pour ${opts.label}`;
      if (key === "labelMapping.suggestion" && opts) return `Suggestion : ${opts.name}`;
      return map[key] ?? key;
    },
  }),
}));

const mockFunds: Fund[] = [
  { id: "f1", fund_identifier: "93", name: "CPAM 93", temp_id: null },
  { id: "f2", fund_identifier: "75", name: "CPAM 75", temp_id: null },
];

const unknownResolution: FundLabelResolution = {
  bank_label: "CPAM93",
  fund_id: null,
  suggested_fund_id: "f1",
  suggested_fund_name: "CPAM 93",
  is_confirmed: false,
  is_rejected: false,
};

const confirmedResolution: FundLabelResolution = {
  bank_label: "MGEN",
  fund_id: "f2",
  suggested_fund_id: null,
  suggested_fund_name: null,
  is_confirmed: true,
  is_rejected: false,
};

const rejectedResolution: FundLabelResolution = {
  bank_label: "CHARGES",
  fund_id: null,
  suggested_fund_id: null,
  suggested_fund_name: null,
  is_confirmed: true,
  is_rejected: true,
};

beforeEach(() => {
  useCacheStore.setState({ funds: mockFunds });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FundLabelMappingStep", () => {
  describe("R7 — all labels shown (confirmed + unknown)", () => {
    test("onConfirm receives both confirmed and unknown labels", () => {
      const onConfirm = vi.fn();
      render(
        <FundLabelMappingStep
          resolutions={[unknownResolution, confirmedResolution]}
          onConfirm={onConfirm}
          isProcessing={false}
        />,
      );
      // Select fund for the unknown label so button is enabled
      const select = screen.getByLabelText("Organisme pour CPAM93");
      fireEvent.change(select, { target: { value: "f1" } });

      fireEvent.click(screen.getByRole("button", { name: "Accepter" }));

      const mappings = (onConfirm.mock.calls[0] as [Map<string, string>])[0];
      // Both labels must be present in the transmitted map
      expect(mappings.has("CPAM93")).toBe(true);
      expect(mappings.has("MGEN")).toBe(true);
    });
  });

  describe("R23 — unknown label starts with empty select", () => {
    test("unknown label has no pre-selected value", () => {
      render(
        <FundLabelMappingStep
          resolutions={[unknownResolution]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      const select = screen.getByLabelText("Organisme pour CPAM93") as HTMLSelectElement;
      expect(select.value).toBe("");
    });

    test("confirmed label is pre-filled with saved fund id", () => {
      render(
        <FundLabelMappingStep
          resolutions={[confirmedResolution]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      const select = screen.getByLabelText("Organisme pour MGEN") as HTMLSelectElement;
      expect(select.value).toBe("f2");
    });

    test("confirmed rejected label is pre-filled with REJECTED sentinel", () => {
      render(
        <FundLabelMappingStep
          resolutions={[rejectedResolution]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      const select = screen.getByLabelText("Organisme pour CHARGES") as HTMLSelectElement;
      expect(select.value).toBe("REJECTED");
    });
  });

  describe("R25 — Accepter button activation", () => {
    test("disabled when an unknown label has no selection", () => {
      render(
        <FundLabelMappingStep
          resolutions={[unknownResolution]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      const btn = screen.getByRole("button", { name: "Accepter" });
      expect(btn).toBeDisabled();
    });

    test("enabled once all labels have a selection", () => {
      render(
        <FundLabelMappingStep
          resolutions={[unknownResolution]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      const select = screen.getByLabelText("Organisme pour CPAM93");
      fireEvent.change(select, { target: { value: "f1" } });
      const btn = screen.getByRole("button", { name: "Accepter" });
      expect(btn).not.toBeDisabled();
    });

    test("enabled when all labels are pre-filled confirmed", () => {
      render(
        <FundLabelMappingStep
          resolutions={[confirmedResolution, rejectedResolution]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      const btn = screen.getByRole("button", { name: "Accepter" });
      expect(btn).not.toBeDisabled();
    });
  });

  describe("R27 — two-block display order", () => {
    test("unknown section header appears before confirmed section header", () => {
      render(
        <FundLabelMappingStep
          resolutions={[confirmedResolution, unknownResolution]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      const sections = screen.getAllByText(/Labels inconnus|Labels déjà enregistrés/);
      expect((sections[0] as HTMLElement).textContent).toBe("Labels inconnus");
      expect((sections[1] as HTMLElement).textContent).toBe("Labels déjà enregistrés");
    });

    test("unknown labels are sorted alphabetically within block", () => {
      const unknown2: FundLabelResolution = { ...unknownResolution, bank_label: "APRIA" };
      render(
        <FundLabelMappingStep
          resolutions={[unknownResolution, unknown2]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      const selects = screen.getAllByRole("combobox");
      // APRIA < CPAM93
      const labels = selects.map((s) => (s as HTMLSelectElement).getAttribute("aria-label") ?? "");
      expect(labels[0]).toContain("APRIA");
      expect(labels[1]).toContain("CPAM93");
    });
  });

  describe("R28 — suggestion shown as hint only", () => {
    test("shows suggestion text when suggested_fund_name present and not rejected", () => {
      render(
        <FundLabelMappingStep
          resolutions={[unknownResolution]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      expect(screen.getByText("Suggestion : CPAM 93")).toBeDefined();
    });

    test("does not show suggestion when rejected", () => {
      render(
        <FundLabelMappingStep
          resolutions={[unknownResolution]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      const select = screen.getByLabelText("Organisme pour CPAM93");
      fireEvent.change(select, { target: { value: "REJECTED" } });
      expect(screen.queryByText("Suggestion : CPAM 93")).toBeNull();
    });

    test("confirmed label does not show suggestion hint", () => {
      const confirmedWithSuggestion: FundLabelResolution = {
        ...confirmedResolution,
        suggested_fund_name: "CPAM 75",
      };
      render(
        <FundLabelMappingStep
          resolutions={[confirmedWithSuggestion]}
          onConfirm={vi.fn()}
          isProcessing={false}
        />,
      );
      expect(screen.queryByText(/Suggestion/)).toBeNull();
    });
  });

  describe("R9 — onConfirm sends all mappings", () => {
    test("sends all label selections including confirmed on confirm", () => {
      const onConfirm = vi.fn();
      render(
        <FundLabelMappingStep
          resolutions={[unknownResolution, confirmedResolution]}
          onConfirm={onConfirm}
          isProcessing={false}
        />,
      );
      // Select a fund for the unknown label
      const select = screen.getByLabelText("Organisme pour CPAM93");
      fireEvent.change(select, { target: { value: "f1" } });

      const btn = screen.getByRole("button", { name: "Accepter" });
      fireEvent.click(btn);

      expect(onConfirm).toHaveBeenCalledOnce();
      const mappings = (onConfirm.mock.calls[0] as [Map<string, string>])[0];
      expect(mappings.get("CPAM93")).toBe("f1");
      expect(mappings.get("MGEN")).toBe("f2"); // confirmed pre-seeded
    });
  });
});
