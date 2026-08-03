/**
 * Unit tests for infra/settings/store.ts (BAS-118B) — localStorage-backed
 * global app setting for the bank-reconciliation procedure display window
 * (BAS-118). Mirrors the storage-format conventions of `theme-mode`
 * (useThemeToggle.ts) and `lastFolderStore.ts`: a plain value per key, with
 * get() defaulting defensively on absence or corruption and set() rejecting
 * invalid writes rather than silently persisting garbage.
 *
 * These tests fail until infra/settings/store.ts is created.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROCEDURE_WINDOW_DAYS,
  getProcedureWindowDays,
  PROCEDURE_WINDOW_STORAGE_KEY,
  setProcedureWindowDays,
} from "./store";

describe("settings store — procedure window (BAS-118B)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns the default (90) when nothing is stored", () => {
    expect(getProcedureWindowDays()).toBe(90);
    expect(DEFAULT_PROCEDURE_WINDOW_DAYS).toBe(90);
  });

  it("persists and reads back a valid positive integer", () => {
    setProcedureWindowDays(30);
    expect(getProcedureWindowDays()).toBe(30);
  });

  it("stores under the documented localStorage key", () => {
    setProcedureWindowDays(45);
    expect(localStorage.getItem(PROCEDURE_WINDOW_STORAGE_KEY)).toBe("45");
  });

  it("falls back to the default when the stored value is not a number", () => {
    localStorage.setItem(PROCEDURE_WINDOW_STORAGE_KEY, "not-a-number");
    expect(getProcedureWindowDays()).toBe(90);
  });

  it("falls back to the default when the stored value is zero", () => {
    localStorage.setItem(PROCEDURE_WINDOW_STORAGE_KEY, "0");
    expect(getProcedureWindowDays()).toBe(90);
  });

  it("falls back to the default when the stored value is negative", () => {
    localStorage.setItem(PROCEDURE_WINDOW_STORAGE_KEY, "-5");
    expect(getProcedureWindowDays()).toBe(90);
  });

  it("falls back to the default when the stored value is not an integer", () => {
    localStorage.setItem(PROCEDURE_WINDOW_STORAGE_KEY, "12.5");
    expect(getProcedureWindowDays()).toBe(90);
  });

  it("rejects setting a zero or negative value (existing valid value untouched)", () => {
    setProcedureWindowDays(60);
    setProcedureWindowDays(0);
    setProcedureWindowDays(-10);
    expect(getProcedureWindowDays()).toBe(60);
  });

  it("rejects setting a non-integer value (existing valid value untouched)", () => {
    setProcedureWindowDays(60);
    setProcedureWindowDays(12.5);
    expect(getProcedureWindowDays()).toBe(60);
  });
});
