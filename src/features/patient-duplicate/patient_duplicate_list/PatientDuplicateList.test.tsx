import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DuplicatePair } from "@/bindings";
import { PatientDuplicateList } from "./PatientDuplicateList";

const PAIR: DuplicatePair = {
  name: "Martin Claire",
  first: {
    id: "a",
    name: "Martin Claire",
    ssn: "1234567890123",
    procedure_count: 1,
    latest_procedure_date: "2026-09-12",
  },
  second: {
    id: "b",
    name: "Martin Claire",
    ssn: null,
    procedure_count: 0,
    latest_procedure_date: null,
  },
};

function renderList(overrides: Partial<Parameters<typeof PatientDuplicateList>[0]> = {}) {
  const props = {
    searchTerm: "",
    pairs: [PAIR],
    loading: false,
    loadFailed: false,
    merge: vi.fn().mockResolvedValue(true),
    dismiss: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<PatientDuplicateList {...props} />);
  return props;
}

const message = () => document.getElementById("patient-duplicate-message")?.textContent;

describe("PatientDuplicateList", () => {
  it("test_pdu_012_a_row_shows_each_patients_ssn_and_activity", () => {
    renderList();
    const row = document.getElementById("patient-duplicate-row-a-b");
    expect(row?.textContent).toContain("Martin Claire");
    expect(row?.textContent).toContain("1234567890123");
    expect(row?.textContent).toContain("1 procedure · last on");
    expect(row?.textContent).toContain("No procedure");
  });

  it("test_pdu_015_shows_one_message_while_loading_when_empty_and_on_failure", () => {
    renderList({ loading: true });
    expect(message()).toBe("Loading duplicates...");
  });

  it("test_pdu_015_says_there_is_nothing_to_review", () => {
    renderList({ pairs: [] });
    expect(message()).toBe("No duplicate to review.");
  });

  it("test_pdu_015_says_the_load_failed", () => {
    renderList({ loadFailed: true });
    expect(message()).toBe("The duplicates could not be loaded.");
  });

  it("test_pdu_014_the_search_hides_the_other_names", () => {
    renderList({ searchTerm: "dupont" });
    expect(message()).toBe("No duplicate to review.");
  });

  it("test_pdu_033_not_a_duplicate_dismisses_the_pair_at_once", async () => {
    const user = userEvent.setup();
    const props = renderList();

    await user.click(screen.getByRole("button", { name: "Not a duplicate" }));

    expect(props.dismiss).toHaveBeenCalledWith(PAIR);
  });

  it("test_pdu_027_the_dialog_closes_when_its_pair_leaves_the_list", async () => {
    const user = userEvent.setup();
    const props = {
      searchTerm: "",
      loading: false,
      loadFailed: false,
      merge: vi.fn().mockResolvedValue(false),
      dismiss: vi.fn(),
    };
    const { rerender } = render(<PatientDuplicateList {...props} pairs={[PAIR]} />);
    await user.click(document.getElementById("patient-duplicate-merge-a-b") as HTMLElement);
    expect(document.getElementById("patient-duplicate-merge-modal")).not.toBeNull();

    rerender(<PatientDuplicateList {...props} pairs={[]} />);

    expect(document.getElementById("patient-duplicate-merge-modal")).toBeNull();
  });

  it("test_pdu_020_merge_opens_the_dialog_for_the_pair", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(document.getElementById("patient-duplicate-merge-a-b") as HTMLElement);

    expect(document.getElementById("patient-duplicate-merge-modal")).not.toBeNull();
  });
});
