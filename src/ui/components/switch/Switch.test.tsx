import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

describe("Switch (#697)", () => {
  it("exposes its state as a switch and toggles on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch id="demo-switch" checked={false} onChange={onChange} label="Ignorer" />);

    const control = document.getElementById("demo-switch");
    expect(control?.getAttribute("role")).toBe("switch");
    expect(control?.getAttribute("aria-checked")).toBe("false");

    if (!control) throw new Error("switch missing");
    await user.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does not toggle while disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch id="demo-switch" checked onChange={onChange} label="Ignorer" disabled />);

    const control = document.getElementById("demo-switch");
    if (!control) throw new Error("switch missing");
    await user.click(control);
    expect(onChange).not.toHaveBeenCalled();
  });
});
