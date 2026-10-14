import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gateway from "../../api/gateway";
import { ProcedureTypeMappingStep } from "./ProcedureTypeMappingStep";

vi.mock("../../api/gateway");
vi.mock("./CreateProcedureTypeModal", () => ({ CreateProcedureTypeModal: () => null }));

const procedureMappings = [{ tmp_id: "tmp-1", amount: 50000 }];
const procedureTypes = [
  { id: "type-1", name: "Consultation", default_amount: 50000, category: null },
];

describe("ProcedureTypeMappingStep — DEBT-046 (EXI-120)", () => {
  let resolveSaved: (value: Awaited<ReturnType<typeof gateway.getExcelAmountMappings>>) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(gateway.getExcelAmountMappings).mockReturnValue(
      new Promise((resolve) => {
        resolveSaved = resolve;
      }),
    );
  });

  it("sends nothing and saves no mapping when Continue is clicked before the saved mappings load", async () => {
    const onMappingComplete = vi.fn();
    render(
      <ProcedureTypeMappingStep
        procedureMappings={procedureMappings}
        procedureTypes={procedureTypes}
        onMappingComplete={onMappingComplete}
      />,
    );

    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
    await userEvent.click(button);

    expect(onMappingComplete).not.toHaveBeenCalled();
    expect(gateway.saveExcelAmountMappings).not.toHaveBeenCalled();
  });

  it("sends the saved mapping once it has loaded", async () => {
    const onMappingComplete = vi.fn();
    render(
      <ProcedureTypeMappingStep
        procedureMappings={procedureMappings}
        procedureTypes={procedureTypes}
        onMappingComplete={onMappingComplete}
      />,
    );

    resolveSaved({ success: true, data: [{ amount: 50000, procedure_type_id: "type-1" }] });
    const button = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(onMappingComplete).toHaveBeenCalledWith({ "tmp-1": "type-1" });
    expect(gateway.saveExcelAmountMappings).toHaveBeenCalledWith([
      { amount: 50000, procedure_type_id: "type-1" },
    ]);
  });

  it("lets the user continue, and keeps the stored mappings, when they cannot be read", async () => {
    vi.mocked(gateway.getExcelAmountMappings).mockRejectedValue(new Error("bridge down"));
    const onMappingComplete = vi.fn();
    render(
      <ProcedureTypeMappingStep
        procedureMappings={procedureMappings}
        procedureTypes={procedureTypes}
        onMappingComplete={onMappingComplete}
      />,
    );

    const button = screen.getByRole("button", { name: "Continue" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(onMappingComplete).toHaveBeenCalledWith({ "tmp-1": "type-1" });
    expect(gateway.saveExcelAmountMappings).not.toHaveBeenCalled();
  });
});
