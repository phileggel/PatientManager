import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/infra/logger";
import { useCreateEntityForm } from "./useCreateEntityForm";

type TestFields = { name: string };
type TestFormData = { name: string };

const initialFields: TestFields = { name: "" };
const toFormData = (f: TestFields): TestFormData => ({ name: f.name.trim() });

function makeOptions(overrides: {
  onSubmit?: (data: TestFormData) => Promise<Record<string, string>>;
  onClose?: () => void;
  initialQuery?: string;
  queryField?: keyof TestFields;
}) {
  return {
    entityName: "test",
    initialFields,
    toFormData,
    onSubmit: overrides.onSubmit ?? vi.fn().mockResolvedValue({}),
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

  it("TODO-026: an empty form is sent, and the refused fields keep the form open with their messages", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ name: "Enter the name." });
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(makeOptions({ onSubmit, onClose })),
    );

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(onSubmit).toHaveBeenCalledWith({ name: "" });
    expect(result.current.errors).toEqual({ name: "Enter the name." });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("TODO-026: editing a refused field clears its message", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ name: "Enter the name." });
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(makeOptions({ onSubmit })),
    );
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    act(() => result.current.updateField("name", "A"));

    expect(result.current.errors).toEqual({});
  });

  it("handleSubmit calls onSubmit with transformed formData and then resets and closes on success", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
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

  it("DEBT-059: submitting logs that it happened, never the values of the form", async () => {
    const info = vi.spyOn(logger, "info");
    const { result } = renderHook(() =>
      useCreateEntityForm<TestFields, TestFormData>(
        makeOptions({ onSubmit: vi.fn().mockResolvedValue({}) }),
      ),
    );

    act(() => result.current.updateField("name", "Nom Prenom"));
    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(info).toHaveBeenCalledWith("test form: Submitting");
    expect(JSON.stringify(info.mock.calls)).not.toContain("Nom Prenom");
  });
});
