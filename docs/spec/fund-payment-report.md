# Business Rules — Reconciliation Report (FPR)

## Context

After validating a fund-payment reconciliation (FPA workflow), the practitioner may produce a summary report of the session. This feature defines the structure, content, and generation mechanism of that report. The report covers two concerns: procedures that remain unreconciled in the reconciliation period, and a log of all corrections that were applied during the session.

The report is rendered as a PDF document by the backend from the session data, then displayed in a preview modal that lets the practitioner save the file to disk. The user retains the saved PDF for archival, sharing, or — if needed — printing through their preferred PDF viewer outside the application. In-app printing is intentionally out of scope.

This spec supersedes FPA-510 in the FPA spec (`fund-payment-auto-match.md`), which described only a minimal browser-print trigger.

---

## Entity Definition

The report is not a persisted entity. Generation is driven by a transient request payload assembled from the live reconciliation session, and the output is a PDF byte stream.

### ReportGenerationRequest

The payload sent from the frontend to the backend when the practitioner clicks Report. It captures everything the backend needs to render the document; no per-row lookup is performed afterwards.

| Field                    | Business meaning                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `locale`                 | Active application locale captured at request time (FPR-021), used to translate every label in the PDF. |
| `source_pdf_filename`    | File name (not full path) of the source PDF the reconciliation session was started from.          |
| `period_start`           | Start date of the period covered, derived from the source PDF.                                    |
| `period_end`             | End date of the period covered, derived from the source PDF.                                      |
| `generation_date`        | Date and time the practitioner clicked Report. Recorded in the document header for audit (FPR-020). |
| `unreconciled_procedures` | The list rendered in Section 1: each row carries a procedure date, patient name, SSN, billed amount. |
| `enriched_corrections`    | The list of corrections rendered in Section 2, pre-shaped column-for-column to FPR-042.            |

> Field names use Rust `snake_case`. Field shape for `unreconciled_procedures` re-uses the type already defined by the FPA reconciliation feature. The `enriched_corrections` field carries display-ready data so the backend never needs to look up procedure or patient details during rendering (FPR-013).

---

## Business Rules

### Report Trigger and Preview (010–019)

**FPR-010 — Report button availability (frontend)**: The Report button is shown only when the report step is active (after successful reconciliation validation). It is absent during all preceding workflow steps.

**FPR-011 — Report action — trigger (frontend + backend)**: Clicking Report assembles a `ReportGenerationRequest` from the live reconciliation session and dispatches it to the backend. The backend renders a PDF document from the request payload alone and returns the resulting bytes. The reconciliation modal stays open and unaffected throughout.

**FPR-012 — _(removed)_**: The previous rule covered closing a separate print window, which no longer exists. The number is intentionally left vacant — never reuse.

**FPR-013 — Session-only data flow (frontend + backend)**:

- _(frontend)_: The `ReportGenerationRequest` payload is built exclusively from data already held in the active reconciliation session — the unreconciled-procedures list fetched after validation and the corrections applied during the session. No additional fetch is performed before sending the request.
- _(backend)_: PDF generation reads only the fields supplied in the request. No additional per-row database lookup, foreign-key resolution, or external call is performed during rendering.

**FPR-014 — Generation failure (frontend)**: If the backend returns an error for the generation request, an error toast is displayed, the Report button returns to its idle state, the preview modal does not open, and no further state changes occur. The user may click Report again to retry.

**FPR-015 — Preview modal opens on success (frontend)**: As soon as the backend returns the PDF bytes, the preview modal opens, embedding the PDF for the practitioner to inspect. The reconciliation modal stays open behind it. The PDF is displayed immediately on modal open — there is no secondary loading state inside the modal. The preview modal exposes two actions: Save and Close.

**FPR-016 — Save action (frontend)**: The Save action opens a system file-save dialog. The default filename is `reconciliation-{period_start}-to-{period_end}.pdf` where each date is formatted `YYYY-MM-DD`. On success, the PDF bytes are written to the chosen path, a success toast is displayed, and the preview modal remains open. If the practitioner cancels the dialog, no file is written and no toast is shown. If the write fails, an error toast is displayed and the preview modal remains open with the Save button available for retry.

**FPR-017 — _(removed)_**: The previous rule covered an in-app Print action invoking the OS print dialog. In-app printing has been dropped from scope; users print externally from the saved PDF if needed. The number is intentionally left vacant — never reuse.

**FPR-018 — Close action (frontend)**: The Close action dismisses the preview modal. The reconciliation modal remains open at the report step, allowing the practitioner to re-open the preview by clicking Report again.

**FPR-019 — Generation in progress (frontend)**: While the backend is producing the PDF, the Report button shows a loading state and is disabled to prevent duplicate generation requests. The button returns to its idle state once the preview modal opens (FPR-015) or once an error toast is surfaced (FPR-014).

### Document Header (020–029)

**FPR-020 — Header content (backend)**: The PDF header displays the report title, the source PDF file name, the period covered (start date and end date derived from the source PDF), and the document generation date.

**FPR-021 — Document language (frontend + backend)**: The active application locale at the moment the user clicks Report is captured by the frontend, sent to the backend with the generation request, and used to translate every label, heading, and static text in the PDF. The locale is fixed once the PDF is generated; switching the application locale afterwards does not retranslate the document.

**FPR-022 — Page numbers (backend)**: Each page of the PDF displays a page number.

### Section 1 — Unreconciled Procedures (030–039)

**FPR-030 — Section 1 purpose (backend)**: Section 1 lists all procedures that remain unreconciled within the source PDF date range, as returned by the reconciliation backend after validation.

**FPR-031 — Unreconciled procedure columns (backend)**: Each row in the unreconciled-procedures table displays: procedure date, patient name, SSN, and billed amount.

**FPR-032 — Empty state (backend)**: If no unreconciled procedures exist for the period, Section 1 displays an explicit confirmation message in place of the table to indicate that all procedures in the range are reconciled. The total line (FPR-033) is omitted in this case.

**FPR-033 — Total billed amount (backend)**: When the unreconciled-procedures table is present, the sum of the billed amounts of all listed procedures is displayed below the table.

### Section 2 — Corrections Applied (040–049)

**FPR-040 — Section 2 omission (backend)**: If no corrections were applied during the session, Section 2 is omitted entirely from the document.

**FPR-041 — Correction grouping and priority order (backend)**: Corrections are presented in separate groups, one per correction type, in the following display priority order: (1) ContestAmount, (2) CreateProcedure, (3) LinkProcedure, (4) AmountMismatch, (5) FundMismatch, (6) DateMismatch. Groups with no corrections are omitted. Within each group, rows are sorted by date ascending.

**FPR-042 — Correction group columns (backend)**: Each group displays the columns relevant to its correction type:

| Correction type | Columns displayed                                                        |
| --------------- | ------------------------------------------------------------------------ |
| ContestAmount   | Patient, procedure date, billed amount, paid amount                      |
| CreateProcedure | Patient name, SSN, procedure date, fund, billed amount                   |
| LinkProcedure   | Patient name, SSN, fund, payment date                                    |
| AmountMismatch  | Patient, procedure date, original billed amount, corrected billed amount |
| FundMismatch    | Patient, procedure date, original fund, corrected fund                   |
| DateMismatch    | Patient, original date, corrected date                                   |

---

## Workflow

```
[Report step active after reconciliation validation]
          │
          ▼
[User clicks Report]
          │
          ▼
[Report button enters loading state]
[Frontend assembles ReportGenerationRequest from session data]
[Frontend dispatches the request to the backend]
          │
          ▼
[Backend renders PDF from the request payload]
          │
   ┌──────┴──────────────┐
   ▼                     ▼
[PDF bytes returned]   [Backend error]
   │                     │
   ▼                     ▼
[Preview modal opens]  [Error toast,
[with embedded PDF]     Report button re-enabled]
   │
   ▼
[User chooses an action]
   │
   ├── Save  → [File-save dialog opens]
   │           [PDF bytes written to chosen path or cancelled]
   │           [Preview modal remains open]
   │
   └── Close → [Preview modal closes]
               [Reconciliation modal remains at the report step]
```

---

## UX Draft

### Entry Point

Report button in the reconciliation modal header, visible only during the report step.

### Main Component

Preview modal layered over the reconciliation modal. The preview modal embeds the generated PDF and exposes two actions in its header or footer: Save, Close.

### States

- **Idle**: Report button in the reconciliation modal is enabled, no preview shown
- **Generating**: Report button shows a loading state and is disabled (FPR-019)
- **Preview ready**: Preview modal open with the PDF embedded and Save / Close visible
- **Section 1 empty**: PDF shows the "all reconciled" confirmation message and no total line; Section 2 may still be present if corrections exist
- **Section 2 absent**: PDF omits the corrections section when no corrections were applied; Section 1 is always present
- **Generation error**: Error toast displayed; preview modal does not open; Report button returns to idle (FPR-014)
- **Save success**: Success toast displayed; preview modal remains open (FPR-016)
- **Save error**: Error toast displayed; preview modal stays open; Save remains available for retry (FPR-016)

### User Flow

1. User reaches the report step after successful validation
2. User clicks the Report button in the reconciliation modal header
3. Report button enters loading state while the backend generates the PDF
4. Preview modal opens with the embedded PDF
5. User chooses Save or Close
   - Save: select a path; PDF is written; preview modal remains open
   - Close: preview modal dismisses; reconciliation modal remains at the report step

---

## Open Questions

None — all questions have been resolved.
