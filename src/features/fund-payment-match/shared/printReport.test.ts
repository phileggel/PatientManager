import { describe, expect, it } from "vitest";
import { buildPrintReportHtml } from "./printReport";
import type { PrintReportViewModel } from "./printReportPresenter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Identity translator: returns the i18n key as-is so we can assert key presence. */
const tIdentity = (key: string, _opts?: object): string => key;

const emptyVm: PrintReportViewModel = {
  header: {
    title: "print.title",
    pdfFileName: "remise-2025-04.pdf",
    periodStart: "2025-04-01",
    periodEnd: "2025-04-30",
    generationDate: "2025-05-03T10:00:00",
  },
  unreconciledRows: [],
  unreconciledTotalThousandths: null,
  correctionGroups: [],
};

// ---------------------------------------------------------------------------
// Header (FPR-020, FPR-021)
// ---------------------------------------------------------------------------

describe("buildPrintReportHtml — header", () => {
  it("contains the translated title key (FPR-020/021)", () => {
    const html = buildPrintReportHtml(emptyVm, tIdentity);

    // t("print.title") is called and its return value appears in the HTML
    expect(html).toContain("print.title");
  });

  it("contains pdfFileName, periodStart, periodEnd, and generationDate (FPR-020)", () => {
    const html = buildPrintReportHtml(emptyVm, tIdentity);

    expect(html).toContain("remise-2025-04.pdf");
    expect(html).toContain("2025-04-01");
    expect(html).toContain("2025-04-30");
    expect(html).toContain("2025-05-03T10:00:00");
  });
});

// ---------------------------------------------------------------------------
// Page numbers (FPR-022)
// ---------------------------------------------------------------------------

describe("buildPrintReportHtml — page numbers", () => {
  it("contains @page CSS rule for page counter (FPR-022)", () => {
    const html = buildPrintReportHtml(emptyVm, tIdentity);

    expect(html).toContain("@page");
  });
});

// ---------------------------------------------------------------------------
// Bootstrap script (FPR-011, FPR-012)
// ---------------------------------------------------------------------------

describe("buildPrintReportHtml — bootstrap script", () => {
  it("contains window.onload and window.onafterprint bootstrap script (FPR-011/012)", () => {
    const html = buildPrintReportHtml(emptyVm, tIdentity);

    expect(html).toContain("window.onload");
    expect(html).toContain("window.onafterprint");
  });
});

// ---------------------------------------------------------------------------
// Section 1 — empty state (FPR-032, FPR-033)
// ---------------------------------------------------------------------------

describe("buildPrintReportHtml — section 1 empty state", () => {
  it("contains the print.section1.empty confirmation message when unreconciledRows is [] (FPR-032)", () => {
    const html = buildPrintReportHtml(emptyVm, tIdentity);

    // t("print.section1.empty") must appear since no rows exist
    expect(html).toContain("print.section1.empty");
  });

  it("does NOT contain a <table> for unreconciled rows when empty (FPR-032)", () => {
    const html = buildPrintReportHtml(emptyVm, tIdentity);

    // The document must not include a table element for the unreconciled section
    // (the confirmation message replaces the table per FPR-032)
    expect(html).not.toContain("<table");
  });

  it("does NOT contain the print.section1.total label when empty (FPR-033 omission)", () => {
    const html = buildPrintReportHtml(emptyVm, tIdentity);

    expect(html).not.toContain("print.section1.total");
  });
});

// ---------------------------------------------------------------------------
// Section 2 — absent case (FPR-040)
// ---------------------------------------------------------------------------

describe("buildPrintReportHtml — section 2 absent", () => {
  it("does NOT contain print.section2.heading when correctionGroups is [] (FPR-040)", () => {
    const html = buildPrintReportHtml(emptyVm, tIdentity);

    expect(html).not.toContain("print.section2.heading");
  });
});

// ---------------------------------------------------------------------------
// Locale switch (FPR-021)
// ---------------------------------------------------------------------------

describe("buildPrintReportHtml — locale switch", () => {
  it("output differs between a French translator and an English translator (FPR-021)", () => {
    const tFr = (key: string): string => `FR_${key}`;
    const tEn = (key: string): string => `EN_${key}`;

    const htmlFr = buildPrintReportHtml(emptyVm, tFr);
    const htmlEn = buildPrintReportHtml(emptyVm, tEn);

    expect(htmlFr).not.toBe(htmlEn);
    // Spot-check: French translator tokens appear in French output
    expect(htmlFr).toContain("FR_print.title");
    // English translator tokens appear in English output
    expect(htmlEn).toContain("EN_print.title");
  });
});
