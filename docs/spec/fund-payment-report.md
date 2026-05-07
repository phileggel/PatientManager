# Business Rules — Reconciliation Report (FPR)

## Context

After validating a fund-payment reconciliation (FPA workflow), the practitioner may produce a summary report of the session. This feature defines the structure, content, and generation mechanism of that report. The report covers two concerns: procedures that remain unreconciled in the reconciliation period, and a log of all corrections that were applied during the session.

The report is rendered as a PDF document by the backend from the session data, then displayed in a preview modal that lets the practitioner save the file to disk. The user retains the saved PDF for archival, sharing, or — if needed — printing through their preferred PDF viewer outside the application. In-app printing is intentionally out of scope.

This spec supersedes FPA-510 in the FPA spec (`fund-payment-auto-match.md`), which described only a minimal browser-print trigger.

---

## Entity Definition

The report is not a persisted entity. Generation is driven by a transient request payload assembled from the live reconciliation session, and the output is a PDF byte stream.

### ReportGenerationRequest

The payload sent from the frontend to the backend when the practitioner clicks Report. It carries every pre-resolved string the renderer will place: translations, formatted dates, formatted currency values, and per-correction joined row strings. The backend performs no translation and no formatting (FPR-013, FPR-021).

| Field                        | Business meaning                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`                      | Pre-translated bold heading for the top of page 1 (FPR-020).                                                                                                                                     |
| `continuation_title`         | Pre-translated breadcrumb shown at the top of every continuation page, e.g. "Reconciliation Report (continued)" (FPR-022).                                                                       |
| `header_lines`               | Ordered list of pre-formatted lines below the title (period, generation date, source-PDF file name) (FPR-020).                                                                                   |
| `unreconciled`               | Section 1 content. Either the empty-state branch (heading + reassurance message) or the populated branch (heading + column headers + rows + total).                                              |
| `correction_section_heading` | Pre-translated heading for Section 2 (FPR-040). Rendered only when `correction_groups` is non-empty.                                                                                             |
| `correction_groups`          | Section 2 — list of correction groups in priority order (FPR-041). Each group has a pre-translated title and a list of pre-joined row strings. An empty list omits Section 2 entirely (FPR-040). |
| `page_label`                 | Pre-translated footer label, e.g. "Page" — rendered as `"{label} {n} / {total}"` on each page (FPR-022).                                                                                         |

> Field names use Rust `snake_case`. The frontend resolves every translation through its existing i18next pipeline and every date / currency value through the platform `Intl.*` formatters before assembling this payload — the backend has no language tables and no formatters (FPR-021).

---

## Business Rules

### Report Trigger and Preview (010–019)

**FPR-010 — Report button availability (frontend)**: The Report button is shown only when the report step is active (after successful reconciliation validation). It is absent during all preceding workflow steps.

**FPR-011 — Report action — trigger (frontend + backend)**: Clicking Report assembles a `ReportGenerationRequest` from the live reconciliation session and dispatches it to the backend. The backend renders a PDF document from the request payload alone and returns the resulting bytes. The reconciliation modal stays open and unaffected throughout.

**FPR-012 — _(removed)_**: The previous rule covered closing a separate print window, which no longer exists. The number is intentionally left vacant — never reuse.

**FPR-013 — Session-only data flow (frontend + backend)**:

- _(frontend)_: The `ReportGenerationRequest` payload is built exclusively from data already held in the active reconciliation session — the unreconciled-procedures list fetched after validation and the corrections applied during the session. The frontend resolves every label through its i18next pipeline and every numeric/date value through `Intl.*` formatters before sending; no additional fetch is performed.
- _(backend)_: PDF generation reads the pre-resolved strings from the request and places them on the page. No translation, no formatting, no database lookup, and no external call is performed during rendering.

**FPR-014 — Generation failure (frontend)**: If the backend returns an error for the generation request, an error toast is displayed, the Report button returns to its idle state, the preview modal does not open, and no further state changes occur. The user may click Report again to retry.

**FPR-015 — Preview modal opens on success (frontend)**: As soon as the backend returns the PDF bytes, the preview modal opens, embedding the PDF for the practitioner to inspect. The reconciliation modal stays open behind it. The PDF is displayed immediately on modal open — there is no secondary loading state inside the modal. The preview modal exposes two actions: Save and Close.

**FPR-016 — Save action (frontend)**: The Save action opens a system file-save dialog. The default filename is `reconciliation-{period_start}-to-{period_end}.pdf` where each date is formatted `YYYY-MM-DD`. On success, the PDF bytes are written to the chosen path, a success toast is displayed, and the preview modal remains open. If the practitioner cancels the dialog, no file is written and no toast is shown. If the write fails, an error toast is displayed and the preview modal remains open with the Save button available for retry.

**FPR-017 — _(removed)_**: The previous rule covered an in-app Print action invoking the OS print dialog. In-app printing has been dropped from scope; users print externally from the saved PDF if needed. The number is intentionally left vacant — never reuse.

**FPR-018 — Close action (frontend)**: The Close action dismisses the preview modal. The reconciliation modal remains open at the report step, allowing the practitioner to re-open the preview by clicking Report again.

**FPR-019 — Generation in progress (frontend)**: While the backend is producing the PDF, the Report button shows a loading state and is disabled to prevent duplicate generation requests. The button returns to its idle state once the preview modal opens (FPR-015) or once an error toast is surfaced (FPR-014).

### Document Header (020–029)

**FPR-020 — Header content (frontend + backend)**: The document header displays the report title, the source PDF file name, the period covered (start date and end date derived from the source PDF), and the document generation date. The frontend assembles each line as a pre-formatted string in the request payload (`title`, `header_lines`); the backend places them in order at the top of page 1.

**FPR-021 — Document language (frontend)**: The active application locale at the moment the user clicks Report determines every translated label, formatted date, and formatted currency value in the request payload. All resolution happens on the frontend (via i18next for labels and `Intl.*` for numbers and dates) before the request reaches the backend. The backend places strings as received and performs no language-aware processing. The chosen locale is fixed once the PDF is generated; switching the application locale afterwards does not retranslate the document.

**FPR-022 — Page numbers (frontend + backend)**: Each page of the PDF displays a page number. The frontend supplies the translated label (`page_label`, e.g. "Page"); the backend appends the current page index and total page count, rendered in the page footer.

### Section 1 — Unreconciled Procedures (030–039)

**FPR-030 — Section 1 purpose (frontend)**: Section 1 lists all procedures that remain unreconciled within the source PDF date range, as returned by the reconciliation backend after validation. The frontend assembles this list into the `unreconciled` field of the request.

**FPR-031 — Unreconciled procedure columns (frontend + backend)**: Each row in the unreconciled-procedures table displays four columns: procedure date, patient name, SSN, and billed amount. The frontend supplies pre-formatted column headers and pre-formatted row cells; the backend places them at fixed column anchors.

**FPR-032 — Empty state (frontend + backend)**: If no unreconciled procedures exist for the period, Section 1 displays an explicit confirmation message in place of the table. The frontend sends the `Empty` variant of `unreconciled` carrying both the section heading and the reassurance message; the backend renders the message and omits the table and total. The total line (FPR-033) is omitted in this case.

**FPR-033 — Total billed amount (frontend + backend)**: When the unreconciled-procedures table is present, the sum of the billed amounts of all listed procedures is displayed below the table. The frontend computes the sum, formats it as a currency string, and supplies it as `total_value` (with the translated `total_label`) in the populated branch of `unreconciled`; the backend renders the line below the table.

### Section 2 — Corrections Applied (040–049)

**FPR-040 — Section 2 omission (frontend + backend)**: If no corrections were applied during the session, Section 2 is omitted entirely from the document. The frontend signals this by sending an empty `correction_groups` array; the backend skips the section heading and the section body when it sees an empty list.

**FPR-041 — Correction grouping and priority order (frontend)**: Corrections are presented in separate groups, one per correction type, in the following display priority order: (1) ContestAmount, (2) CreateProcedure, (3) LinkProcedure, (4) AmountMismatch, (5) FundMismatch, (6) DateMismatch. Groups with no corrections are omitted. Within each group, rows are sorted by date ascending. The frontend enforces this ordering when building the `correction_groups` list and when sorting rows within each group; the backend renders groups and rows in the order received.

**FPR-042 — Correction group columns (frontend)**: Each group displays the columns relevant to its correction type. The frontend joins the variant-specific columns into a single pre-formatted line per row before sending; the backend renders each line as a single text run beneath its translated group title.

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
