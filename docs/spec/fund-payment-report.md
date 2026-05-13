# Business Rules — Reconciliation Report (FPR)

## Context

After validating a fund-payment reconciliation (FPA workflow), the practitioner may produce a summary report of the session. This feature defines the structure, content, and generation mechanism of that report. The report covers two concerns: procedures that remain unreconciled in the reconciliation period, and a log of all corrections that were applied during the session.

The report is rendered as a PDF document by the backend from the session data, written to the user's Downloads directory under a locale-aware filename, then opened in the system default PDF viewer for inspection. The user retains the saved PDF for archival, sharing, or — if needed — printing through their preferred PDF viewer outside the application. In-app preview and in-app printing are intentionally out of scope.

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

**FPR-011 — Report action — trigger (frontend + backend)**: Clicking Report assembles a `ReportGenerationRequest` from the live reconciliation session, builds a locale-aware leaf filename, and dispatches both to the single backend export command. The backend renders the PDF, writes it to the user's Downloads directory under the supplied filename, and launches the system default PDF viewer on the saved file (FPR-015, FPR-016). The reconciliation modal stays open and unaffected throughout.

**FPR-012 — _(removed)_**: The previous rule covered closing a separate print window, which no longer exists. The number is intentionally left vacant — never reuse.

**FPR-013 — Session-only data flow (frontend + backend)**:

- _(frontend)_: The `ReportGenerationRequest` payload is built exclusively from data already held in the active reconciliation session — the unreconciled-procedures list fetched after validation and the corrections applied during the session. The frontend resolves every label through its i18next pipeline and every numeric/date value through `Intl.*` formatters before sending; no additional fetch is performed.
- _(backend)_: PDF generation reads the pre-resolved strings from the request and places them on the page. No translation, no formatting, no database lookup, and no external call is performed during rendering.

**FPR-014 — Export failure (frontend)**: If the backend returns an error for the export command — rendering, write, or launcher failure — an error toast is displayed, the Report button returns to its idle state, and no further state changes occur. The user may click Report again to retry.

**FPR-015 — Export to Downloads + open in system viewer (frontend + backend)**: On Report click, the backend renders the PDF, writes it to the platform Downloads directory under the frontend-supplied filename, and launches the system default PDF viewer on the saved file. A success toast confirms the export and names the saved file. The reconciliation modal stays at the report step; the user can re-export by clicking Report again.

- _(backend)_: The supplied filename is validated as a leaf name only — no path separators, no `..` segments, must end in `.pdf`, length-capped. The destination directory is fixed to the platform Downloads folder; no user-supplied path component reaches the filesystem. If a same-named file already exists, a ` (N)` suffix is appended before the extension (`name.pdf` → `name (1).pdf` → …) so a re-export never silently overwrites a prior file.
- _(frontend)_: The success toast uses the path leaf returned by the backend, so the collision-suffixed name (if any) appears verbatim in the confirmation.

**FPR-016 — Filename construction (frontend)**: The frontend builds the leaf filename `{stem}_{YYYY-MM}.pdf` where `stem` is translated through i18n (French: `rapport_rapprochement_caisse`; default: `fund_reconciliation_report`) and `YYYY-MM` is taken from the `YYYY-MM-DD` ISO slice of the period end date. The period end-month is the "majority month" by construction (reports typically cover most of one month with a few overflow days at the start).

**FPR-017 — _(removed)_**: The previous rule covered an in-app Print action invoking the OS print dialog. In-app printing has been dropped from scope; users print externally from the saved PDF if needed. The number is intentionally left vacant — never reuse.

**FPR-018 — _(removed)_**: The previous rule covered closing the preview modal, which no longer exists — the system PDF viewer manages its own window. The number is intentionally left vacant — never reuse.

**FPR-019 — Export in progress (frontend)**: While the backend is producing and opening the PDF, the Report button shows a loading state and is disabled to prevent duplicate export requests. The button returns to its idle state once the success toast is shown (FPR-015) or an error toast is surfaced (FPR-014).

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
[Frontend builds locale-aware leaf filename "{stem}_{YYYY-MM}.pdf"]
[Frontend dispatches request + filename to the export command]
          │
          ▼
[Backend renders PDF, writes to Downloads (with ` (N)` suffix on collision),
 then launches the system default PDF viewer on the saved file]
          │
   ┌──────┴──────────────┐
   ▼                     ▼
[Success path]         [Backend error
                        (render / write / launch)]
   │                     │
   ▼                     ▼
[Success toast names    [Error toast,
 the saved file;         Report button re-enabled]
 system PDF viewer
 opens the file in a
 separate OS window]
[Reconciliation modal stays at the report step]
```

---

## UX Draft

### Entry Point

Report button in the reconciliation modal header, visible only during the report step.

### Main Component

The export is in-app fire-and-forget: a single button click renders, saves, and hands the file to the OS. The PDF is then visible in the user's system PDF viewer (a separate OS window outside the application). The reconciliation modal remains the only in-app surface.

### States

- **Idle**: Report button in the reconciliation modal is enabled
- **Exporting**: Report button shows a loading state and is disabled (FPR-019)
- **Section 1 empty**: PDF shows the "all reconciled" confirmation message and no total line; Section 2 may still be present if corrections exist
- **Section 2 absent**: PDF omits the corrections section when no corrections were applied; Section 1 is always present
- **Export success**: Success toast names the saved file; the system PDF viewer opens it in a separate OS window; reconciliation modal stays at the report step (FPR-015)
- **Export error**: Error toast displayed; Report button returns to idle so the user can retry (FPR-014)

### User Flow

1. User reaches the report step after successful validation
2. User clicks the Report button in the reconciliation modal header
3. Report button enters the exporting state
4. The PDF is saved to the user's Downloads folder and opens in the system default PDF viewer
5. Success toast confirms the export and names the saved file
6. Reconciliation modal remains at the report step; the user can re-export by clicking Report again

---

## Open Questions

None — all questions have been resolved.
