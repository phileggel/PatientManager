import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportModal } from "./ImportModal";

describe("ImportModal", () => {
  it("shows its translated title, not the translation key", () => {
    render(<ImportModal isOpen onClose={vi.fn()} onNavigate={vi.fn()} onFileSelected={vi.fn()} />);
    expect(screen.getByText("Import")).toBeInTheDocument();
    expect(screen.queryByText("modalTitle")).not.toBeInTheDocument();
  });
});
