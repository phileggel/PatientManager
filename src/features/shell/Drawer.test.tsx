/**
 * RTL component test — Drawer nav-settings entry (BAS-118B).
 *
 * A new « Paramètres » navigation entry opens the settings dialog (first
 * entry of that surface, BAS-118B). Mirrors the existing conditional-render
 * pattern of `onOpenManagement` / `onOpenImport`.
 *
 * These tests fail until Drawer.tsx exposes `onOpenSettings` + `nav-settings`.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { Drawer } from "./Drawer";

describe("Drawer — nav-settings entry (BAS-118B)", () => {
  it("renders the settings nav entry when onOpenSettings is provided", () => {
    render(<Drawer isExpanded={true} onToggle={vi.fn()} onOpenSettings={vi.fn()} />);

    expect(document.getElementById("nav-settings")).not.toBeNull();
  });

  it("does not render the settings nav entry when onOpenSettings is omitted", () => {
    render(<Drawer isExpanded={true} onToggle={vi.fn()} />);

    expect(document.getElementById("nav-settings")).toBeNull();
  });

  it("calls onOpenSettings when the settings nav entry is clicked", async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();

    render(<Drawer isExpanded={true} onToggle={vi.fn()} onOpenSettings={onOpenSettings} />);

    const navSettings = document.getElementById("nav-settings");
    if (!navSettings) throw new Error("nav-settings button missing");
    await user.click(navSettings);

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
