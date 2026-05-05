import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateEntityForm } from "./useCreateEntityForm";

type TestFields = { name: string };
type TestFormData = { name: string };

const initialFields: TestFields = { name: "" };
const validator = (f: TestFields): Record<string, string> =>
  f.name.trim() ? {} : { name: "Name is required" };
const toFormData = (f: TestFields): TestFormData => ({ name: f.name.trim() });

function makeOptions(overrides: {
  onSubmit?: (data: TestFormData) => Promise<void>;
  onClose?: () => void;
  initialQuery?: string;
  queryField?: keyof TestFields;
}) {
  return {
    entityName: "test",
    initialFields,
    validator,
    toFormData,
    onSubmit: overrides.onSubmit ?? vi.fn(),
    onClose: overrides.onClose ?? vi.fn(),
    initialQuery: overrides.initialQuery,
    queryField: overrides.queryField,
  };
}

describe("useCreateEntityForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with the provided initialFields", () => {
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(makeOptions({})),
    );

    expect(result.current.fields).toEqual({ name: "" });
    expect(result.current.errors).toEqual({});
    expect(result.current.isSubmitting).toBe(false);
  });

  it("pre-populates queryField with initialQuery via effect", () => {
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(
        makeOptions({ initialQuery: "Alice", queryField: "name" }),
      ),
    );

    expect(result.current.fields.name).toBe("Alice");
  });

  it("updateField changes the specified field", () => {
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(makeOptions({})),
    );

    act(() => result.current.updateField("name", "Bob"));

    expect(result.current.fields.name).toBe("Bob");
  });

  it("handleSubmit sets errors and does not call onSubmit when validation fails", async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(makeOptions({ onSubmit })),
    );

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.errors.name).toBe("Name is required");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("handleSubmit calls onSubmit with transformed formData and then resets and closes on success", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(makeOptions({ onSubmit, onClose })),
    );

    act(() => result.current.updateField("name", "  Alice  "));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(onSubmit).toHaveBeenCalledWith({ name: "Alice" });
    expect(result.current.fields).toEqual({ name: "" });
    expect(onClose).toHaveBeenCalled();
  });

  it("handleSubmit sets submit error and does not close when onSubmit throws", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("server error"));
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(makeOptions({ onSubmit, onClose })),
    );

    act(() => result.current.updateField("name", "Alice"));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.errors.submit).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });

  it("handleClose resets fields and calls onClose", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(makeOptions({ onClose })),
    );

    act(() => result.current.updateField("name", "Alice"));
    act(() => result.current.handleClose());

    expect(result.current.fields).toEqual({ name: "" });
    expect(onClose).toHaveBeenCalled();
  });

  it("reset clears fields back to initialFields and clears errors", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(makeOptions({ onSubmit })),
    );

    act(() => result.current.updateField("name", "Alice"));

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });
    expect(result.current.errors.submit).toBeTruthy();

    act(() => result.current.reset());

    expect(result.current.fields).toEqual({ name: "" });
    expect(result.current.errors).toEqual({});
  });
});
