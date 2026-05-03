# Business Rules — Automatic Reconciliation via PDF Import (FPA)

## Context

A practitioner receives payment statements (PDF) from health-insurance funds (CPAM, etc.). These statements list reimbursed procedures. This feature **automatically reconciles** these PDF lines against procedures stored in the database, then creates the corresponding fund-payment groups.

This document covers exclusively the **automatic flow**: PDF parsing, matching algorithm, corrections, and group creation.

---

## Business Rules

### Procedure eligibility for reconciliation (010–050)

**FPA-010 (R1) — Eligible procedures (backend)**: Only procedures in a non-final status are candidates for reconciliation (`None`, `Created`, `PartiallyReconciled`, `Reconciliated`). Already-paid procedures (`DirectlyPayed`, `FundPayed`, `PartiallyFundPayed`, `ImportDirectlyPayed`, `ImportFundPayed`) are excluded from the matching pool.

**FPA-020 (R2) — PDF total validation (backend + frontend)**: At parsing time, the sum of the amounts of all lines in a PDF group is compared with the total amount declared by the fund. If the two do not match, a visual warning is displayed (`is_total_valid = false`). This validation is informational — it does not block reconciliation.

**FPA-030 (R28) — Unparsed lines (backend + frontend)**: Some PDF lines may not be recognized by the parser (unexpected format, comment lines, etc.). They are silently excluded from reconciliation. The number of unparsed lines and the first 5 as samples are displayed as a warning to the user.

**FPA-040 (R29) — Negative-amount refunds (backend)**: The fund may emit lines with a negative amount (e.g. `-76,80 €`) to flag a refund. These lines are parsed normally and treated as a `NotFoundIssue` (no procedure in the database can match a negative amount). The user creates the procedure via the usual action (`CreateProcedure`) or via the global auto-correction. The creation follows the same behaviour as FPA-250: the procedure is added to the fund payment group and ends up `Reconciliated` after confirmation. The only distinction is that the `billed_amount` is negative.

**FPA-050 (R3) — PDF duplicate detection (backend)**: When fund-payment groups are created, the system checks whether a group with the same (fund, date, total amount) already exists. If all candidates are duplicates, the processing is rejected entirely — the PDF was likely already imported.

### Matching algorithm (100–160)

**FPA-100 (R4) — 8-pass algorithm (backend)**: Reconciliation runs in 8 sequential passes, each with different criteria. A PDF line not resolved in pass N is retried in pass N+1:

| Passes | Line type                 | Amount  | Date tolerance           |
| ------ | ------------------------- | ------- | ------------------------ |
| 1–2    | Single procedure / Period | Exact   | Exact                    |
| 3–4    | Single procedure / Period | Closest | Exact                    |
| 5–6    | Single procedure / Period | Exact   | -1 day on the start date |
| 7–8    | Single procedure / Period | Closest | -1 day on the start date |

Odd-numbered passes handle single-date procedures; even-numbered passes handle periods (start date ≠ end date).

**FPA-110 (R5) — Definition of an anomaly (backend)**: An anomaly is a discrepancy between PDF data and the corresponding database data. Three anomaly types are detected:

- **AmountMismatch**: `procedure_amount` in the database ≠ PDF line amount (exact comparison, in thousandths of a euro)
- **FundMismatch**: the fund label in the PDF contains neither the name nor the identifier of the fund associated with the procedure in the database
- **DateMismatch**: the procedure was found only thanks to the -1-day tolerance (passes 5–8) — its date therefore differs from the PDF date

A procedure with none of these anomalies is considered a perfect match.

**FPA-120 (R6) — Perfect match (backend)**: A PDF line is a perfect match (`PerfectSingleMatch`, `PerfectGroupMatch`) if: (1) the sum of the procedure amounts exactly equals the PDF amount, (2) no anomaly is detected (see FPA-110), and (3) **all** of the patient's procedures within the PDF line's own date/period field are covered by the match (single-date line → that exact date; period line → the `du…au` date range on the line). No user action is required.

**FPA-130 (R7) — Single match with anomaly (backend)**: A PDF line matches exactly one procedure but presents one or more anomalies (`SingleMatchIssue`, see FPA-110).

**FPA-140 (R8) — Group match with anomaly (backend + frontend)**: A PDF line matches several procedures (grouped procedures) but presents anomalies (`GroupMatchIssue`, see FPA-110). In the GroupMatch card, each matched procedure displays its `DateMismatch` and `FundMismatch` anomalies as chips. The "Validate distribution" button accepts simultaneously all corrections (amount, date, fund) for all procedures in the group.

**FPA-150 (R9) — Too many matches (backend)**: If more than 8 candidate procedures are found without a clear match, the case is marked `TooManyMatchIssue`. This case is blocking — no automatic correction is possible, manual intervention in the database is required.

**FPA-160 (R10) — Not found (backend)**: No matching procedure found after the 8 passes (`NotFoundIssue`). Nearby candidates are searched and proposed to the user for manual linking (see FPA-240). Candidate procedures are those whose date falls within the window `[PDF_start_date - 1 day, PDF_end_date + 1 day]` — for a single-date line, this is ±1 day. The search has no patient or SSN filter. Excluded: deleted procedures (`is_deleted`), procedures with a status other than `CREATED`, procedures already linked to a fund payment (`fund_payment_line`), and procedures already matched in the current pass.

### Corrections (200–260)

**FPA-200 (R11) — Amount correction (backend)**: The procedure's amount in the database is updated to the PDF amount (`AmountMismatch` → `AutoCorrection::AmountMismatch`).

**FPA-210 (R12) — Amount contest (frontend + backend)**: When the fund pays less than the invoiced amount, the practitioner can "contest": the actual paid amount is recorded separately without changing the procedure's amount (`AutoCorrection::ContestAmount`, status → `PartiallyReconciled`).

**FPA-220 (R13) — Fund correction (backend)**: The fund associated with the procedure is updated to the PDF fund (`FundMismatch` → `AutoCorrection::FundMismatch`).

**FPA-230 (R14) — Date correction (backend + frontend)**: The backend detects a date discrepancy between the procedure and the PDF line only on a -1-day tolerance (matching passes 5–8). A "Fix date" button is shown in the `SingleMatchCard` among the other anomalies, with no dedicated card.

**FPA-240 (R15) — Manual linking (frontend + backend)**: For a `NotFoundIssue`, the user can link the PDF line to a suggested existing procedure (`AutoCorrection::LinkProcedure`). A procedure can only be linked once. On linking, the patient's SSN is updated to the PDF SSN — the PDF is authoritative for the SSN.

**FPA-250 (R16) — Missing procedure creation (backend)**: For a `NotFoundIssue`, if no existing procedure can be linked, the user can trigger creation of a new procedure from the PDF data (`AutoCorrection::CreateProcedure`). If the patient does not exist (unknown SSN), they are created automatically. The created procedure receives the `import-pdf` type. After the reconciliation is confirmed, the procedure ends up with `Reconciliated` status — it is added to the fund payment group and reconciled atomically as part of the confirmation step, not as a separate action.

**FPA-260 (R17) — Automatic fund resolution (backend)**: The fund label in the PDF (e.g. "CPAM n° 931") is automatically resolved to an existing fund by extracting the numeric identifier. If the fund does not exist in the database, it is created automatically.

### Procedure status (300–320)

**FPA-300 (R18) — Status lifecycle (backend)**: A procedure's final status is reached in two stages from two distinct features:

- **Stage 1 — Fund reconciliation** (manual or automatic): the procedure goes from `Created` to `Reconciliated` (full payment accepted) or `PartiallyReconciled` (contested amount, see FPA-210). In both cases, `fund_reconciliation_date` is set to the group's payment date and `actual_payment_amount` is set.
- **Stage 2 — Bank reconciliation** (`bank-statement-match` feature): when the fund's transfer is detected on the bank statement, the procedure moves to its final status:
  - `Reconciliated` → `FundPayed`
  - `PartiallyReconciled` → `PartiallyFundPayed` (the `actual_payment_amount` from the contest is preserved)

⚠️ As soon as a procedure in the group reaches Stage 2, the group becomes locked: it can no longer be edited or deleted.

**FPA-310 (R19) — Post-persistence consistency check (backend)**: After the fund-payment group is created, the sum of the `actual_payment_amount` of all procedures in the group must be strictly equal to the group's `total_amount`. In the import flow, `total_amount` comes from the PDF and is not computed from the `procedure_amount`s. This check is non-blocking (warning logged only).

**FPA-320 (R30) — Group status during bank reconciliation (backend)**: During reconciliation at the bank level (Stage 2 of the lifecycle, see FPA-300), the group moves to `BankPayed` status. This change is performed by the `bank-statement-auto-match` or `bank-statement-manual-match` feature depending on the flow used.

### Navigation and UX (400–460)

**FPA-400 (R20) — Display order (frontend)**: Anomalies are presented in the PDF document order (by ascending `line_index`), except `TooManyMatchIssue`s which are surfaced at the top of the list (see FPA-410).

**FPA-410 (R21) — Blocking cases (frontend)**: `TooManyMatchIssue`s are blocking — they cannot be resolved in the UI and prevent validation. They must be displayed first, before the other anomalies, so the user is immediately informed of the impossibility of validating without manual database intervention.

**FPA-420 (R22) — Resolution required before validation (frontend)**: Validation is blocked as long as not all anomalies are resolved. An anomaly is resolved when a correction or contest has been accepted.

**FPA-430 (R23) — Automatic advancement (frontend)**: As soon as an anomaly is resolved, the UI automatically advances to the next unresolved anomaly (after a 500 ms delay).

**FPA-440 (R24) — Enter key = primary action (frontend)**: On a SingleMatch card, the Enter key applies the first available correction. On an already-resolved or TooManyMatch card, it moves to the next anomaly.

**FPA-450 (R25) — Global auto-correction (frontend)**: A button applies all possible corrections automatically. It is hidden if any `TooManyMatchIssue` is present or any `GroupMatchIssue` is unresolved — in those cases, manual intervention is required.

Action applied per anomaly type:

| Type                                  | Auto-correction action                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `NotFoundIssue`                       | Triggers a `CreateProcedure` — unless the line is already accepted or a nearby candidate has already been linked manually |
| `SingleMatchIssue` — `AmountMismatch` | Applies `AutoCorrection::AmountMismatch` with the PDF amount                                                              |
| `SingleMatchIssue` — `FundMismatch`   | Applies `AutoCorrection::FundMismatch` with the PDF fund label                                                            |
| `SingleMatchIssue` — `DateMismatch`   | Applies `AutoCorrection::DateMismatch` with the PDF date                                                                  |
| `GroupMatchIssue`                     | Not handled — button hidden as long as group issues remain unresolved                                                     |
| `TooManyMatchIssue`                   | Not handled — button hidden                                                                                               |

**FPA-460 (R26) — Auto-validation (frontend)**: As soon as all anomalies are resolved, validation is triggered automatically without user action. On failure, the cycle is not retried.

### Post-validation report (500–510)

**FPA-500 (R27) — Unreconciled-procedures report (backend + frontend)**: After validation, a report of unreconciled procedures within the PDF date range is displayed, allowing the practitioner to detect forgotten or unreimbursed procedures.

**FPA-510 (R31) — Report printing (frontend)** ⚠️ _Superseded by FPR spec (`docs/spec/fund-payment-print-report.md`)_: When the report is displayed (post-validation step only), a "Print" button is present in the modal's fixed header. Full print behavior (document structure, new window, correction log) is defined in the FPR spec. The button is absent during all other workflow steps.

---

## Workflow

```
[User selects a PDF file]
          │
          ▼
[Extract PDF text] (backend)
          │
          ▼
[Parse PDF into structured lines] (backend)
  → Group by fund / payment date / total
  → Total validation (sum of lines = declared total)
          │
          ▼
[Reconcile PDF lines ↔ DB procedures] (backend)
  → 8 sequential passes by SSN / date / amount
  → Classification: PerfectMatch / SingleIssue / GroupIssue / TooMany / NotFound
          │
          ▼
[Display anomalies to resolve] (frontend)
  → TooManyMatchIssue shown first (blocking)
  → Then anomalies in PDF document order
  → For each anomaly: correction / contest / link buttons
  → Progress bar + automatic advancement
          │
          ▼
[All anomalies resolved?]
  → No: the user continues correcting
  → Yes: auto-validation triggered
          │
          ▼
[Apply corrections + create fund payment] (backend)
  → Duplicate check: reject if the same PDF has already been imported
  → Update procedures per AutoCorrections
  → Resolve fund labels (creating funds if needed)
  → Create missing procedures / missing patients
  → Create fund-payment group
  → Update procedure statuses → Reconciliated / PartiallyReconciled
  → Post-persistence consistency check (non-blocking)
          │
          ▼
[Unreconciled-procedures report] (backend + frontend)
  → Date range extracted from the PDF
  → List of procedures with no fund payment in this range
          │
          ▼
[End — close the modal or view the report]
```

---

## Open questions

- [x] **FPA-120 — "All of the patient's procedures in the covered period" criterion**: Resolved — "covered period" = the PDF line's own date/period field: exact date for single-date lines, the `du…au` range for period lines. FPA-120 updated accordingly.

- [x] **FPA-040 — Negative-amount handling and consistency with procedure-orchestration-spec**: Resolved — no conflict. `CreateProcedure` (both FPA-250 and FPA-040) creates procedures with status `None` via `create_procedures_batch_from_candidates`. They are added to the fund payment group and reach `Reconciliated` at group confirmation, following the normal lifecycle. FPA-040 describes the end state, not an at-creation exception. Positive and negative-amount procedures follow identical flows.

- [x] **confirmed_payment_date at fund-reconciliation vs. bank-transfer time**: Resolved — `confirmed_payment_date` will remain the bank-transfer date (Stage 2). A new `fund_reconciliation_date` column will be added to `Procedure` to record the Stage 1 fund-document payment date separately. See docs/todo.md for the migration task.
