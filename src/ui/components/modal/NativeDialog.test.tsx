import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeDialog } from "./NativeDialog";

afterEach(() => {
  document.body.style.overflow = "unset";
});

const renderDialog = (props: Partial<React.ComponentProps<typeof NativeDialog>> = {}) =>
  render(
    <NativeDialog id="test-dialog" onClose={props.onClose ?? vi.fn()} className="w-64" {...props}>
      <p>dialog content</p>
    </NativeDialog>,
  );

describe("NativeDialog", () => {
  it("opens in the top layer via showModal on mount", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.open).toBe(true);
  });

  it("closes on Escape (native cancel) while keeping React state authoritative", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // preventDefault kept the element open — the caller unmounts it instead.
    expect(dialog.open).toBe(true);
  });

  it("does not close on Escape when disableClose is set", () => {
    const onClose = vi.fn();
    renderDialog({ onClose, disableClose: true });
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: false, cancelable: true }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on backdrop click (event targeting the dialog element itself)", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on clicks inside the panel", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByText("dialog content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the scroll lock until the last nested dialog unmounts", () => {
    const outer = renderDialog();
    const inner = render(
      <NativeDialog id="inner-dialog" onClose={vi.fn()} className="w-64">
        <p>inner</p>
      </NativeDialog>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    inner.unmount();
    expect(document.body.style.overflow).toBe("hidden");

    outer.unmount();
    expect(document.body.style.overflow).toBe("unset");
  });
});
