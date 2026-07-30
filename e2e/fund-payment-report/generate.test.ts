/**
 * E2E — generate_fund_reconciliation_report_pdf
 *
 * Tests the IPC contract for the post-reconciliation PDF report command
 * (FPR-011, FPR-013).
 *
 * Approach — Option B (direct invoke):
 *   The full UI flow that reaches the report step requires selecting a PDF file
 *   via the native OS file dialog, which is outside WebDriver's reach (same
 *   category as the ComboboxField carve-out in ADR-004). These tests therefore
 *   call the Tauri command directly via `browser.execute(invoke(...))`,
 *   exercising the real running binary and proving the IPC contract works
 *   end-to-end (real Rust renderer, real font loading, real validation).
 *
 * Coverage:
 *   - Happy path — minimal valid request (Empty section 1, no corrections)
 *   - Happy path — populated request (Rows section 1 + correction groups)
 *   - Error path — InvalidRequest (empty title)
 *   - Error path — InvalidRequest (control character in title)
 */

import assert from "node:assert";
import { tauriInvoke } from "../helpers/tauri-invoke";

// PDF magic bytes: %PDF
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

/**
 * A minimal but fully valid ReportGenerationRequest. Uses the Empty variant
 * of UnreconciledSection (FPR-032) and an empty correction_groups list
 * (FPR-040) to keep the payload small while exercising the full render path.
 *
 * Strings are in French because per ADR-006 the frontend pre-resolves all
 * translation and formatting before the request reaches the renderer — these
 * literals mirror exactly what production code sends.
 */
const MINIMAL_REQUEST = {
  title: "Rapport de rapprochement",
  continuation_title: "Rapport de rapprochement (suite)",
  header_lines: [
    "Période : 01/04/2026 – 30/04/2026",
    "Généré le : 7 mai 2026, 10:00",
    "Fichier PDF : remise-2026-04.pdf",
  ],
  unreconciled: {
    type: "Empty",
    data: {
      heading: "Actes non rapprochés",
      empty_message: "Tous les actes de la période ont été rapprochés.",
    },
  },
  correction_section_heading: "Corrections appliquées",
  correction_groups: [],
  page_label: "Page",
} as const;

/**
 * A populated ReportGenerationRequest with Section 1 rows (FPR-031, FPR-033)
 * and two correction groups (FPR-041, FPR-042). Exercises the renderer's
 * table layout and multi-section flow.
 */
const POPULATED_REQUEST = {
  title: "Rapport de rapprochement",
  continuation_title: "Rapport de rapprochement (suite)",
  header_lines: [
    "Période : 01/04/2026 – 30/04/2026",
    "Généré le : 7 mai 2026, 10:00",
    "Fichier PDF : remise-2026-04.pdf",
  ],
  unreconciled: {
    type: "Rows",
    data: {
      heading: "Actes non rapprochés",
      column_headers: {
        date: "Date acte",
        patient: "Patient",
        ssn: "INS",
        amount: "Montant facturé",
      },
      rows: [
        {
          date: "05/04/2026",
          patient: "DUPONT Jean",
          ssn: "1234567890123",
          amount: "85,00 €",
        },
        {
          date: "12/04/2026",
          patient: "MARTIN Claire",
          ssn: "2345678901234",
          amount: "60,00 €",
        },
        {
          date: "20/04/2026",
          patient: "BERNARD Olivier",
          ssn: "3456789012345",
          amount: "110,00 €",
        },
      ],
      total_label: "Total",
      total_value: "255,00 €",
    },
  },
  correction_section_heading: "Corrections appliquées",
  correction_groups: [
    {
      title: "Corrections de montant",
      rows: ["RICHARD Sophie | 08/04/2026 | 85,00 € → 80,00 €"],
    },
    {
      title: "Corrections de caisse",
      rows: ["PETIT Lucas | 10/04/2026 | CPAM 75 → CPAM 93"],
    },
  ],
  page_label: "Page",
} as const;

describe("generate_fund_reconciliation_report_pdf", () => {
  // ── Happy path — minimal (Empty section 1, no corrections) ─────────────────

  it("returns PDF bytes for minimal valid request (Empty section 1, no corrections)", async () => {
    const result = await tauriInvoke<number[]>(
      "generate_fund_reconciliation_report_pdf",
      { request: MINIMAL_REQUEST },
    );

    assert.ok(result.ok, `Command should succeed, got error: ${!result.ok ? result.error : ""}`);
    if (!result.ok) return; // narrowing — already asserted above

    const bytes = result.data;
    assert.ok(Array.isArray(bytes), "Result data should be an array of bytes");
    assert.ok(bytes.length > 0, "PDF byte stream must not be empty");

    // Verify %PDF magic bytes — proves the Rust renderer produced a real PDF
    assert.strictEqual(bytes[0], PDF_MAGIC[0], "Byte 0 must be 0x25 ('%')");
    assert.strictEqual(bytes[1], PDF_MAGIC[1], "Byte 1 must be 0x50 ('P')");
    assert.strictEqual(bytes[2], PDF_MAGIC[2], "Byte 2 must be 0x44 ('D')");
    assert.strictEqual(bytes[3], PDF_MAGIC[3], "Byte 3 must be 0x46 ('F')");
  });

  // ── Happy path — populated (Rows section 1 + correction groups) ────────────

  it("returns PDF bytes for populated request (Rows section 1 + correction groups)", async () => {
    const result = await tauriInvoke<number[]>(
      "generate_fund_reconciliation_report_pdf",
      { request: POPULATED_REQUEST },
    );

    assert.ok(result.ok, `Command should succeed, got error: ${!result.ok ? result.error : ""}`);
    if (!result.ok) return; // narrowing

    const bytes = result.data;
    assert.ok(Array.isArray(bytes), "Result data should be an array of bytes");
    assert.ok(bytes.length > 0, "PDF byte stream must not be empty");

    // The populated render (table + corrections) should produce more bytes
    // than the minimal (empty-state) render — a basic sanity check.
    const minimalResult = await tauriInvoke<number[]>(
      "generate_fund_reconciliation_report_pdf",
      { request: MINIMAL_REQUEST },
    );
    const minimalLen = minimalResult.ok ? minimalResult.data.length : 0;
    assert.ok(
      bytes.length >= minimalLen,
      "Populated PDF should be at least as large as the minimal PDF",
    );

    // Magic bytes check
    assert.strictEqual(bytes[0], PDF_MAGIC[0], "Byte 0 must be 0x25 ('%')");
    assert.strictEqual(bytes[1], PDF_MAGIC[1], "Byte 1 must be 0x50 ('P')");
    assert.strictEqual(bytes[2], PDF_MAGIC[2], "Byte 2 must be 0x44 ('D')");
    assert.strictEqual(bytes[3], PDF_MAGIC[3], "Byte 3 must be 0x46 ('F')");
  });

  // ── Error path — InvalidRequest: empty title ────────────────────────────────

  it("returns InvalidRequest error when title is empty", async () => {
    const badRequest = { ...MINIMAL_REQUEST, title: "" };

    const result = await tauriInvoke<number[]>(
      "generate_fund_reconciliation_report_pdf",
      { request: badRequest },
    );

    assert.ok(!result.ok, "Command should fail for empty title");
    if (result.ok) return; // narrowing

    // Tauri's WebKit→WebDriver bridge generic-ifies command error strings
    // (see tauriInvoke docstring at top of file). The backend log confirms
    // the rejection ("title must not be empty"); the specific text is not
    // observable from the test harness. Asserting non-emptiness is the
    // strongest contract we can hold here, matching the other error tests.
    assert.ok(result.error.length > 0, "Error message must be a non-empty string");
  });

  // ── Error path — InvalidRequest: control character in title ────────────────

  it("returns InvalidRequest error when title contains a NUL control character", async () => {
    const badRequest = { ...MINIMAL_REQUEST, title: "Rapport\x00NUL" };

    const result = await tauriInvoke<number[]>(
      "generate_fund_reconciliation_report_pdf",
      { request: badRequest },
    );

    assert.ok(!result.ok, "Command should fail for NUL in title");
    if (result.ok) return; // narrowing

    assert.ok(result.error.length > 0, "Error message must be a non-empty string");
  });

  // ── Error path — InvalidRequest: empty page_label ──────────────────────────

  it("returns InvalidRequest error when page_label is empty", async () => {
    const badRequest = { ...MINIMAL_REQUEST, page_label: "" };

    const result = await tauriInvoke<number[]>(
      "generate_fund_reconciliation_report_pdf",
      { request: badRequest },
    );

    assert.ok(!result.ok, "Command should fail for empty page_label");
    if (result.ok) return; // narrowing

    assert.ok(result.error.length > 0, "Error message must be a non-empty string");
  });
});
