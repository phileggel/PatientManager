import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDateField } from "./useDateField";

/** Types `text` into the field, as a keyboard edit does. */
function type(result: { current: ReturnType<typeof useDateField> }, text: string) {
  act(() =>
    result.current.handleInputChange({
      target: { value: text },
    } as React.ChangeEvent<HTMLInputElement>),
  );
}

function sent(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls.map(([e]) => e.target.value);
}

describe("useDateField", () => {
  it("ticket #452: emptying the text by keyboard reports an empty value", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useDateField("2026-03-10", onChange, "fr-FR"));

    type(result, "");

    expect(sent(onChange)).toEqual([""]);
  });

  it("ticket #452: a partly retyped date is reported as typed, never the previous date", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useDateField(value, onChange, "fr-FR"), {
      initialProps: { value: "2026-03-10" },
    });

    type(result, "10/03/20");
    rerender({ value: "10/03/20" });

    expect(sent(onChange)).toEqual(["10/03/20"]);
    expect(result.current.displayValue).toBe("10/03/20");
  });

  it("ticket #452: a partial text shaped like an ISO prefix is shown as typed", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useDateField(value, onChange, "fr-FR"), {
      initialProps: { value: "" },
    });

    type(result, "2026-03");
    rerender({ value: "2026-03" });

    expect(result.current.displayValue).toBe("2026-03");
  });

  it("a complete date is reported in ISO form", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useDateField("", onChange, "fr-FR"));

    type(result, "10/03/2026");

    expect(sent(onChange)).toEqual(["2026-03-10"]);
  });
});
