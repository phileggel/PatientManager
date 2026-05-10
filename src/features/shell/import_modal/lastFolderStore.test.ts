import { beforeEach, describe, expect, it } from "vitest";

import { getLastFolder, parentDir, setLastFolder } from "./lastFolderStore";

describe("lastFolderStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("get/set roundtrip", () => {
    it("returns undefined when no folder was ever stored for the kind", () => {
      expect(getLastFolder("excel")).toBeUndefined();
      expect(getLastFolder("fund-pdf")).toBeUndefined();
      expect(getLastFolder("bank-pdf")).toBeUndefined();
    });

    it("persists and reads back the folder for a single kind", () => {
      setLastFolder("excel", "/home/alice/imports");
      expect(getLastFolder("excel")).toBe("/home/alice/imports");
    });

    it("keeps a separate slot per kind so they don't overwrite each other", () => {
      setLastFolder("excel", "/excel/path");
      setLastFolder("fund-pdf", "/fund/path");
      setLastFolder("bank-pdf", "/bank/path");

      expect(getLastFolder("excel")).toBe("/excel/path");
      expect(getLastFolder("fund-pdf")).toBe("/fund/path");
      expect(getLastFolder("bank-pdf")).toBe("/bank/path");
    });

    it("ignores empty-string writes (does not blow away a previous value)", () => {
      setLastFolder("excel", "/keep/me");
      setLastFolder("excel", "");
      expect(getLastFolder("excel")).toBe("/keep/me");
    });
  });

  describe("parentDir", () => {
    it("returns the parent dir for a POSIX path", () => {
      expect(parentDir("/home/alice/imports/file.xlsx")).toBe("/home/alice/imports");
    });

    it("returns the parent dir for a Windows path", () => {
      expect(parentDir("C:\\Users\\alice\\imports\\file.xlsx")).toBe("C:\\Users\\alice\\imports");
    });

    it("returns the parent dir when the path mixes separators", () => {
      // Picked path can come from either platform; mixed forms shouldn't break.
      expect(parentDir("/home/alice\\imports\\file.xlsx")).toBe("/home/alice\\imports");
    });

    it("returns undefined for a bare filename with no separator", () => {
      expect(parentDir("file.xlsx")).toBeUndefined();
    });

    it("returns undefined when the only separator is at the start (root file)", () => {
      // "/file.xlsx" has no real parent directory we'd want to remember.
      expect(parentDir("/file.xlsx")).toBeUndefined();
    });

    it("returns undefined for a file sitting at the Windows drive root", () => {
      // "C:\\file.xlsx" → "C:" is a bare drive letter, not a real folder.
      expect(parentDir("C:\\file.xlsx")).toBeUndefined();
    });
  });
});
