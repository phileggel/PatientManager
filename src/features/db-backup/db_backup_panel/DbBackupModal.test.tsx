import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DbBackupModal } from "./DbBackupModal";

describe("DbBackupModal", () => {
  it("shows its translated title, not the translation key", () => {
    render(<DbBackupModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText("Database backup")).toBeInTheDocument();
    expect(screen.queryByText("modalTitle")).not.toBeInTheDocument();
  });
});
