# Business Rules — Reconciliation Print Report (FPR)

## Context

After validating a fund-payment reconciliation (FPA workflow), the practitioner may print a summary report. This feature defines the structure, content, and generation mechanism of that print document. The report covers two concerns: procedures that remain unreconciled in the reconciliation period, and a log of all corrections that were applied during the session.

This spec supersedes FPA-510 in the FPA spec (`fund-payment-auto-match.md`), which described only a minimal browser-print trigger.

---

## Business Rules

### Print Trigger (010–019)

**FPR-010 — Print button availability (frontend)**: The Print button is shown only when the report step is active (after successful reconciliation validation). It is absent during all preceding workflow steps.

**FPR-011 — Print action (frontend)**: Clicking Print assembles a self-contained print document from the current session data and opens it in a new browser window, which immediately triggers the browser's native print dialog as soon as the document finishes loading. The reconciliation modal remains open and unaffected.

**FPR-012 — Print window close intent (frontend)**: The application registers a listener on the print window to close it after the user completes or dismisses the print dialog. If the webview does not fire the close event, the window remains open without error and the user can close it manually.

**FPR-013 — Data source (frontend)**: The print document is assembled entirely from data already held in the active reconciliation session: the unreconciled-procedures list fetched after validation and the corrections applied during the session. No additional backend fetch is triggered at print time.

**FPR-014 — Window open failure (frontend)**: If the print window cannot be opened, an error message is displayed to the user inside the reconciliation modal. The modal remains open and the Print button remains available for a retry.

### Document Header (020–029)

**FPR-020 — Header content (frontend)**: The print document header displays: the report title, the source PDF file name, the period covered (start date and end date derived from the PDF), and the document generation date.

**FPR-021 — Document language (frontend)**: All labels, headings, and static text in the print document are translated using the active application locale at the time the document is generated. Locale is embedded in the document at generation time.

**FPR-022 — Page numbers (frontend)**: Each page of the printed document displays a page number.

### Section 1 — Unreconciled Procedures (030–039)

**FPR-030 — Section 1 purpose (frontend)**: Section 1 lists all procedures that remain unreconciled within the PDF date range, as returned by the reconciliation backend after validation.

**FPR-031 — Unreconciled procedure columns (frontend)**: Each row in the unreconciled-procedures table displays: procedure date, patient name, SSN, and billed amount.

**FPR-032 — Empty state (frontend)**: If no unreconciled procedures exist for the period, Section 1 displays an explicit confirmation message in place of the table to indicate that all procedures in the range are reconciled. The total line (FPR-033) is omitted in this case.

**FPR-033 — Total billed amount (frontend)**: When the unreconciled-procedures table is present, the sum of the billed amounts of all listed procedures is displayed below the table.

### Section 2 — Corrections Applied (040–049)

**FPR-040 — Section 2 omission (frontend)**: If no corrections were applied during the session, Section 2 is omitted entirely from the document.

**FPR-041 — Correction grouping and priority order (frontend)**: Corrections are presented in separate groups, one per correction type, in the following display priority order: (1) ContestAmount, (2) CreateProcedure, (3) LinkProcedure, (4) AmountMismatch, (5) FundMismatch, (6) DateMismatch. Groups with no corrections are omitted. Within each group, rows are sorted by date ascending.

**FPR-042 — Correction group columns (frontend)**: Each group displays the columns relevant to its correction type:

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
[User clicks Print]
          │
          ▼
[Frontend assembles the print document from session data]
  → Header: report title, PDF file name, period, generation date
  → Section 1: unreconciled procedures table + total (or "all reconciled" if empty)
  → Section 2: corrections grouped by priority (omitted entirely if no corrections)
          │
          ▼
[New browser window opens with the assembled document]
[Browser print dialog triggers as soon as the document loads]
          │
          ▼
[User prints or cancels]
          │
          ▼
[Application attempts to close the print window]
[Reconciliation modal remains open]
```

---

## UX Draft

### Entry Point

Print button in the reconciliation modal header, visible only during the report step.

### Main Component

Dedicated HTML document rendered in a new browser window — not a modal, overlay, or embedded view.

### States

- **Normal**: document assembled, new window opens, print dialog triggers immediately on load
- **Section 1 empty**: "all reconciled" confirmation message and no total line; Section 2 may still be present if corrections exist
- **Section 2 absent**: corrections section omitted when no corrections were applied; Section 1 is always present
- **Error**: print window failed to open — error message shown in the reconciliation modal; Print button remains active

### User Flow

1. User reaches the report step after successful validation
2. User clicks the Print button in the modal header
3. A new window opens with the formatted document; the print dialog opens immediately
4. User prints or dismisses — the application attempts to close the print window
5. The reconciliation modal remains open for the user to dismiss

---

## Open Questions

None — all questions have been resolved.
