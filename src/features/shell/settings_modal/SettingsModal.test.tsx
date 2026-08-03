/**
 * RTL component test — SettingsModal (BAS-118B).
 *
 * First (and currently only) entry of the new settings surface: the
 * bank-reconciliation procedure display-window, in days (BAS-118). Number
 * input pre-filled from the persisted value (default 90), validated inline
 * as a positive integer; Save persists and closes, an invalid value is
 * rejected inline without persisting or closing.
 *
 * Design pins (task description only, no existing precedent in this repo):
 *   - Props: isOpen, onClose.
 *   - Mocks the settings-store boundary (`@/infra/settings/store`), mirroring
 *     how feature tests mock their gateway module.
 *   - Stable ids: settings-modal, settings-window-days-input, settings-error,
 *     settings-save, settings-cancel.
 *
 * These tests fail until settings_modal/SettingsModal.tsx is created.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/infra/settings/store", () => ({
  DEFAULT_PROCEDURE_WINDOW_DAYS: 90,
  getProcedureWindowDays: vi.fn(),
  setProcedureWindowDays: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
    i18n: { language: "fr" },
  }),
}));

import * as settingsStore from "@/infra/settings/store";
import { SettingsModal } from "./SettingsModal";

const mockGet = vi.mocked(settingsStore.getProcedureWindowDays);
const mockSet = vi.mocked(settingsStore.setProcedureWindowDays);

describe("SettingsModal — BAS-118B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(90);
  });

  it("pre-fills the window-days input from the persisted value", () => {
    mockGet.mockReturnValue(30);

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    const input = document.getElementById("settings-window-days-input") as HTMLInputElement | null;
    expect(input?.value).toBe("30");
  });

  it("defaults the input to 90 when nothing is persisted", () => {
    mockGet.mockReturnValue(90);

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    const input = document.getElementById("settings-window-days-input") as HTMLInputElement | null;
    expect(input?.value).toBe("90");
  });

  it("persists the new value and closes when Save is clicked with a valid positive integer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<SettingsModal isOpen={true} onClose={onClose} />);

    const input = document.getElementById("settings-window-days-input") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "45");

    const saveBtn = document.getElementById("settings-save");
    if (!saveBtn) throw new Error("save button missing");
    await user.click(saveBtn);

    expect(mockSet).toHaveBeenCalledWith(45);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rejects a zero value inline and does not persist or close", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<SettingsModal isOpen={true} onClose={onClose} />);

    const input = document.getElementById("settings-window-days-input") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "0");

    const saveBtn = document.getElementById("settings-save");
    if (!saveBtn) throw new Error("save button missing");
    await user.click(saveBtn);

    expect(mockSet).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.getElementById("settings-error")).not.toBeNull();
  });

  it("rejects a negative value inline", async () => {
    const user = userEvent.setup();

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    const input = document.getElementById("settings-window-days-input") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "-5");

    const saveBtn = document.getElementById("settings-save");
    if (!saveBtn) throw new Error("save button missing");
    await user.click(saveBtn);

    expect(mockSet).not.toHaveBeenCalled();
    expect(document.getElementById("settings-error")).not.toBeNull();
  });

  it("rejects a non-integer value inline", async () => {
    const user = userEvent.setup();

    render(<SettingsModal isOpen={true} onClose={vi.fn()} />);

    const input = document.getElementById("settings-window-days-input") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "12.5");

    const saveBtn = document.getElementById("settings-save");
    if (!saveBtn) throw new Error("save button missing");
    await user.click(saveBtn);

    expect(mockSet).not.toHaveBeenCalled();
    expect(document.getElementById("settings-error")).not.toBeNull();
  });

  it("closes without persisting when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<SettingsModal isOpen={true} onClose={onClose} />);

    const input = document.getElementById("settings-window-days-input") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "45");

    const cancelBtn = document.getElementById("settings-cancel");
    if (!cancelBtn) throw new Error("cancel button missing");
    await user.click(cancelBtn);

    expect(mockSet).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
