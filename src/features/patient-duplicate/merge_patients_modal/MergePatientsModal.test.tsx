import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DuplicatePair } from "@/bindings";
import { MergePatientsModal } from "./MergePatientsModal";

const PAIR: DuplicatePair = {
  name: "Martin Claire",
  first: {
    id: "a",
    name: "Martin Claire",
    ssn: "1234567890123",
    procedure_count: 14,
    latest_procedure_date: "2026-09-12",
  },
  second: {
    id: "b",
    name: "Martin Claire",
    ssn: null,
    procedure_count: 2,
    latest_procedure_date: "2026-02-03",
  },
};

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

describe("MergePatientsModal", () => {
  it("renders nothing without a pair", () => {
    const { container } = render(
      <MergePatientsModal pair={null} onMerge={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("test_pdu_020_preselects_the_first_patient_and_states_what_moves", () => {
    render(<MergePatientsModal pair={PAIR} onMerge={vi.fn()} onClose={vi.fn()} />);

    expect(byId<HTMLInputElement>("patient-duplicate-merge-keep-first").checked).toBe(true);
    expect(byId<HTMLInputElement>("patient-duplicate-merge-keep-second").checked).toBe(false);
    expect(screen.getByText(/1234567890123/)).toBeInTheDocument();
    expect(byId("patient-duplicate-merge-consequence").textContent).toContain(
      "The 2 procedures of record 2",
    );
  });

  it("test_pdu_020_keeping_the_other_patient_swaps_the_merge", async () => {
    const onMerge = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MergePatientsModal pair={PAIR} onMerge={onMerge} onClose={onClose} />);

    await user.click(byId("patient-duplicate-merge-choice-second"));
    expect(byId("patient-duplicate-merge-consequence").textContent).toContain(
      "The 14 procedures of record 1",
    );

    await user.click(byId("patient-duplicate-merge-confirm"));
    expect(onMerge).toHaveBeenCalledWith("b", "a");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("test_pdu_027_stays_open_when_the_merge_fails", async () => {
    const onMerge = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MergePatientsModal pair={PAIR} onMerge={onMerge} onClose={onClose} />);

    await user.click(byId("patient-duplicate-merge-confirm"));

    expect(onMerge).toHaveBeenCalledWith("a", "b");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("test_pdu_027_the_buttons_are_disabled_while_the_merge_runs", async () => {
    let finish: (done: boolean) => void = () => {};
    const onMerge = vi.fn().mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<MergePatientsModal pair={PAIR} onMerge={onMerge} onClose={vi.fn()} />);

    await user.click(byId("patient-duplicate-merge-confirm"));

    expect(byId<HTMLButtonElement>("patient-duplicate-merge-cancel").disabled).toBe(true);
    expect(byId<HTMLButtonElement>("patient-duplicate-merge-confirm").disabled).toBe(true);
    finish(true);
  });

  it("test_pdu_029_warns_when_the_two_ssn_differ_and_names_the_patient_not_kept", async () => {
    const both = { ...PAIR, second: { ...PAIR.second, ssn: "2222222222222" } };
    const user = userEvent.setup();
    render(<MergePatientsModal pair={both} onMerge={vi.fn()} onClose={vi.fn()} />);

    expect(byId("patient-duplicate-merge-ssn-warning").textContent).toContain(
      "The SSN of record 2 will not be kept",
    );

    await user.click(byId("patient-duplicate-merge-choice-second"));
    expect(byId("patient-duplicate-merge-ssn-warning").textContent).toContain(
      "The SSN of record 1 will not be kept",
    );
  });

  it("test_pdu_029_no_warning_when_an_ssn_is_missing_or_both_are_equal", () => {
    const { unmount } = render(
      <MergePatientsModal pair={PAIR} onMerge={vi.fn()} onClose={vi.fn()} />,
    );
    expect(document.getElementById("patient-duplicate-merge-ssn-warning")).toBeNull();
    unmount();

    const same = { ...PAIR, second: { ...PAIR.second, ssn: PAIR.first.ssn } };
    render(<MergePatientsModal pair={same} onMerge={vi.fn()} onClose={vi.fn()} />);
    expect(document.getElementById("patient-duplicate-merge-ssn-warning")).toBeNull();
  });

  it("says a patient without procedures is only deleted", async () => {
    const empty = {
      ...PAIR,
      second: { ...PAIR.second, procedure_count: 0, latest_procedure_date: null },
    };
    render(<MergePatientsModal pair={empty} onMerge={vi.fn()} onClose={vi.fn()} />);
    expect(byId("patient-duplicate-merge-consequence").textContent).toContain(
      "Record 2 has no procedure",
    );
    expect(screen.getByText("No procedure")).toBeInTheDocument();
  });
});
