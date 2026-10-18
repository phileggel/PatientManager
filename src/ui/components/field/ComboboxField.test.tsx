import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ComboboxField } from "./ComboboxField";

const ITEMS = [{ id: "1", label: "Martin Claire" }];
const noResult = (q: string) => `No patient matches ${q}`;

function renderField(onCreateNew?: (q: string) => void) {
  render(
    <ComboboxField
      id="patient"
      label="Patient"
      items={ITEMS}
      displayKey="label"
      idKey="id"
      value=""
      onChange={vi.fn()}
      onCreateNew={onCreateNew}
      createLabel="Create the patient"
      noResultLabel={noResult}
    />,
  );
}

describe("ComboboxField", () => {
  it("PRO-150, PRO-160: in creation mode a search with no result shows the message and the create action", async () => {
    renderField(vi.fn());
    await userEvent.type(screen.getByLabelText("Patient"), "zzz");
    expect(await screen.findByText("No patient matches zzz")).toBeInTheDocument();
    expect(screen.getByText("Create the patient")).toBeInTheDocument();
  });

  it("PRO-160: in edit mode a search with no result shows the message alone", async () => {
    renderField();
    await userEvent.type(screen.getByLabelText("Patient"), "zzz");
    expect(await screen.findByText("No patient matches zzz")).toBeInTheDocument();
    expect(screen.queryByText("Create the patient")).not.toBeInTheDocument();
  });
});
