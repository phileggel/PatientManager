import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ManagementModal } from "./ManagementModal";

describe("ManagementModal", () => {
  it("shows its translated title, not the translation key", () => {
    render(<ManagementModal isOpen onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText("Management")).toBeInTheDocument();
    expect(screen.queryByText("modalTitle")).not.toBeInTheDocument();
  });
});
