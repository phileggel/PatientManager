# Business Rules — Excel Import (excel-import)

## Context

A practitioner has a historical Excel file containing their patients, funds, and monthly procedures. This feature lets the user import this file to initialize or update the database, while resolving duplicates, mapping procedure types, and protecting data that is already reconciled.

---

## Business Rules

### Excel file structure

**EXI-010 (R1) — Expected sheets (backend)**: The parser recognizes three kinds of sheets in the Excel file:

- **`Patiente` sheet** (optional): list of patients with name (col A), SSN (col C). Column D (latest fund identifier) is read but not persisted at import time. If the sheet is absent, patients are inferred from the monthly sheets.
- **`Secu` sheet** (optional): list of funds with identifier (col A), name (col B). The address (col C) is read but not persisted — only the identifier and the name are stored.
- **Monthly sheets** (optional): named `Jan`, `Fév`, `Mars`, `Avr`, `Mai`, `Juin`, `Juil`, `Août`, `Sep`, `Oct`, `Nov`, `Déc` (or full names — these abbreviations match the user's actual French Excel file). Each sheet represents one month. Columns are detected dynamically from a header row (row 2): `CAISSE`, `TARIF`, `DATE` are mandatory; `T` (payment method), `REMBSE` (confirmed payment date), `Versé` (actual amount paid), and `En attente` are optional.

**EXI-020 (R2) — Lines skipped during parsing (backend)**: A line on a monthly sheet is skipped (without a blocking error) in the following cases:

- Patient name empty, `#N/A`, or not found in the parsed patient list
- Amount missing, non-numeric, or ≤ 0
- Date missing or in an unrecognized format (`DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, or Excel serial number)
- Fund referenced but not found in the parsed fund list
- Insufficient column count

All skipped lines are collected in a parsing report displayed to the user at the end of the import.

### Data validation

**EXI-030 (R3) — Patient SSN validation (backend)**: The SSN is optional. If provided, it must contain exactly 13 ASCII digits. Three cases:

- Valid SSN (13 digits): primary deduplication key.
- Missing or empty SSN: deduplicate by lowercased name.
- SSN provided but invalid: stored in the name as `"{name} (code: {ssn})"` for traceability, and deduplication is by name.

**EXI-040 (R4) — Fund validation (backend)**: The fund's identifier and name are required (non-empty). The address is optional. The parser skips a fund missing either and reports it. The deduplication key is the exact fund identifier.

### Temporary identification

**EXI-050 (R5) — Temporary identifiers (backend)**: At parsing time, each entity (patient, fund, procedure) receives a temporary identifier (`temp_id`) as a UUID. These identifiers let procedures be linked to their patients and funds without real DB IDs. `temp_id`s are valid only for the current parsing session.

**EXI-060 (R6) — Temporary procedure-type identifier (backend)**: A `procedure_type_tmp_id` (UUID) is assigned to each procedure based on its amount. All procedures with the same amount share the same `procedure_type_tmp_id`. This grouping by amount lets the user map each unique amount to a real procedure type.

**EXI-070 (R7) — A mapping belongs to its parse (backend)**: Each parse draws new `procedure_type_tmp_id`s (EXI-060), so a type mapping keyed on them holds for the parse that produced it only. Whether the screen parses a file again is the mock's (owner, 2026-11-07, #634).

### Deduplication

**EXI-080 (R8) — Patient deduplication (backend)**: During parsing, patients are deduplicated in memory by SSN (if valid) or by lowercased name. At import-execution time, the database lookup follows the same priority:

- If the SSN is present and a patient with that SSN exists in the DB → reuse (no creation).
- If the SSN is present but not found in the DB → create.
- If the SSN is missing → fall back to a case-insensitive name lookup. Among matches, a patient with a non-empty SSN wins over one without; remaining ties resolve via DB iteration order (non-deterministic). If still no match, the patient is created. This prevents the same blank-SSN patient from being recreated every time the workbook is re-imported.

**EXI-090 (R9) — Fund deduplication (backend)**: During parsing, funds are deduplicated by exact identifier. At execution time, each fund is looked up in the DB by identifier:

- If a fund with the same identifier exists → reuse (no creation).
- Otherwise → create.

**EXI-100 (R10) — Procedure deduplication by month (backend)**: Procedures are not deduplicated individually. Duplicate handling is done at the whole-month level (see EXI-170 and EXI-180).

### Sheet selection

**EXI-110 (R11) — Sheets to import (backend)**: An import executes the monthly sheets it is given, by canonical sheet name (`Jan`, `Fév`, `Mars`, …); procedures of the other sheets are not imported. An import given no sheet still resolves the workbook's patients and funds (EXI-080, EXI-090) and creates no procedure.

### Procedure-type mapping

**EXI-130 (R13) — Default type (backend)**: An amount can be mapped to the default type `imported-from-excel`; its procedures take the reserved type « Import » (EXI-131).

**EXI-131 — The default type is stored as the reserved type (backend)**: A procedure whose amount is mapped to `imported-from-excel` is created with the reserved type, id `import-pdf` (see R21 of procedure-type.md). No procedure type is created.

**EXI-150 (R25) — Procedures skipped if amount missing from mapping (backend)**: If an amount is missing from the mapping received at execution time, all procedures matching that amount are skipped, each reported (EXI-290).

**EXI-151 — A mapped type that does not exist (backend)**: When the mapping received at execution time names a procedure type that does not exist — deleted since the mapping, or never created — the import is refused before anything is written, whatever rows use that amount, with an error naming any one such type by the identifier the mapping gave (owner, 2026-11-15, #621). The default type `imported-from-excel` is never refused: it stands for the reserved type, which cannot be deleted (EXI-131, procedure-type.md R22). This is the mapping the import is given; the saved mappings are filtered on read instead (EXI-250, procedure-type.md R6).

### Reconciled-data protection

**EXI-160 (R15) — Blocked month (backend)**: Before importing a selected sheet, the system checks the sheet's nominal month — whether procedures exist in the database with a blocking status for that month. The blocking statuses are those that block a deletion (PRO-030A): each ties the procedure to a fund-payment group or a bank entry that deleting it would leave dangling. If so, the entire month is **blocked**: no procedure for that month is deleted or recreated. Blocked months are reported in the result. EXI-281 guarantees that every accepted row's `procedure_date` falls in the sheet's nominal month, so per-month blocking remains consistent with per-sheet selection.

**EXI-161 — A month holding a payment (backend)**: A procedure held by a fund payment line, named by a bank entry, or named by a procedure refund (as its source or its refund) blocks its month as EXI-160 says, whatever its status — the import's side of PRO-030B: the import never touches a real payment (#621).

**EXI-170 (R16) — Pre-import deletion (backend)**: If a sheet's nominal month is not blocked (see EXI-160), **all** existing procedures for that month are permanently deleted before the new data is imported, unless EXI-171 applies. This mechanism allows a corrected sheet to be re-imported without accumulating duplicates.

**EXI-171 — A workbook with no well-formed date (backend)**: When no procedure row of the workbook has a date in the expected format (EXI-280), the import cannot tell the year of its months: it blocks and replaces no month, and every row that reaches the date gate is reported skipped (EXI-290).

**EXI-175 — A failed import writes nothing (backend)**: Every write of an import — the patients and funds it creates (EXI-080, EXI-090), the procedures of the months it replaces (EXI-170), the procedures it creates and the patients' tracking fields (EXI-190) — happens in one transaction. If any of them fails, none applies and the import is rejected with an error: every procedure of every month, selected or not, is as it was before the import.

**EXI-176 — What is not a failure (backend)**: A blocked month (EXI-160) does not fail the import, nor does a skipped row: one whose amount has no mapping (EXI-150), whose patient reference matches no patient of the workbook, or whose dates fail a gate (EXI-280, EXI-281). Nor does a patient kept with an invalid SSN (EXI-030), or a fund the parser skipped (EXI-040).

**EXI-177 — Events of an import (backend)**: Once the transaction is committed, an import raises `PatientUpdated` if it wrote a patient, `FundUpdated` if it created a fund, and `ProcedureUpdated` if it deleted or created a procedure, each at most once. A failed import raises none.

**EXI-178 — What a failed import does not undo (backend)**: The mapping preferences (EXI-230) and the procedure types created for its mapping remain after a failed import.

**EXI-179 — What fails an import (backend)**: An import fails, as EXI-175 says, when a read or a write fails (the database refusing a patient, fund or procedure is a failed write), or when the domain refuses a patient or fund that passed parsing, or when the mapping names a type that does not exist (EXI-151). The refused patient, the refused fund and the type that does not exist each have their own error.

### Import orchestration

**EXI-180 (R17) — Execution order (backend)**: The writes of an import follow a strict order; everything they need is read before the first of them, starting with the check of the types the mapping names (EXI-151):

1. Resolve and create patients (existing reused, new ones created)
2. Resolve and create funds (existing reused, new ones created)
3. Validate selected sheets: identify blocked months (per EXI-160) and list the non-blocked months as the months to replace (per EXI-170); the procedures of the months to replace are deleted before any procedure is created. (none when EXI-171 applies)
4. For each procedure row in a selected sheet: first drop rows whose patient reference matches no patient of the workbook, then those whose amount has no mapping (per EXI-150), then apply the execute-time validation gates (EXI-280 format, EXI-281 month-match) before creating the procedure; rows that fail any gate are reported per EXI-290

The writes of these steps and of EXI-190 apply as one (EXI-175).

**EXI-190 (R18) — Patient tracking-field update (backend)**: After procedures are created, the patient's tracking fields (`latest_date`, `latest_procedure_type`, `latest_fund`, `latest_procedure_amount`) are updated to reflect the most recent imported procedure (see R19 of procedure-orchestration.md).

**EXI-200 (R19) — Initial status of imported procedures (backend)**: The initial status is computed by the orchestration based on the payment data present in the Excel (see R15 and R16 of procedure-orchestration.md):

- Procedure with no confirmed payment → `Created`
- Procedure with confirmed payment, ES/CH method or no fund → `ImportDirectlyPaid`
- Procedure with confirmed payment, other method, with fund → `ImportFundPaid`

Procedures in `Created` are then eligible for fund reconciliation (see R1 of fund-payment-auto-match.md).

### Result and reporting

**EXI-210 (R20) — Result (backend)**: An import's result counts the patients created and reused, the funds created and reused, and the procedures created, deleted and skipped — skipped meaning a row of an unselected sheet (counted, not reported, EXI-290) or of a blocked month, whose patient reference matches no patient of the workbook, whose amount has no mapping (EXI-150), or that failed a date gate (EXI-280, EXI-281); parse-time skips are not counted. It lists the blocked months, if any.

**EXI-220 (R21) — Import report (backend)**: An import's report holds two lists (today the parse gives the missing sheets and its skipped lines, the import its own, and the screen merges and sorts them — owed by #429):

- **Missing sheets**: list of monthly sheets expected but not found in the Excel file, by their canonical name (EXI-110).
- **Skipped lines**: a single flat table with columns sheet, row, reason. Lines may come from either parse-time skips (see EXI-020, EXI-040) or execute-time skips (see EXI-290) — the two origins are merged: a line either reached the database or did not, whatever the stage. Lines skipped because of an `#N/A` name or empty row are never reported (too numerous and not informative — the parser drops them silently, so they reach neither the wire nor the display). Rows are sorted by sheet (canonical month order) then row number.

This report is informative and non-blocking.

### Mapping memory

**EXI-230 (R22) — Mapping persistence (backend)**: A type mapping (amount → procedure type) is saved for later imports, one per amount, a later save replacing it; any procedure type is accepted, one deleted later being filtered out on read (EXI-250). It is saved apart from the import and stays after a failed one (EXI-178).

**EXI-240 (R23) — Saved mappings read back (backend)**: The saved mappings can be read back, filtered as EXI-250 says; an import applies only the mapping it is given.

**EXI-250 (R24) — Filtering of deleted types (backend)**: Saved mappings are filtered before they are returned: only mappings whose procedure type still exists (not deleted) or whose value is the default type `imported-from-excel` are returned; a mapping keeps that value as such (EXI-131 applies to the procedure only). If a type was deleted since the last import, its mapping is excluded.

### Open Questions

- [x] **Year-drift acceptance (Stance A, accepted)**: EXI-281 only checks that `procedure_date.month` equals the sheet's nominal month; it does not check the year. A 2025-dated row in a 2026 workbook's `Jan` sheet is accepted. Convention violation is the user's responsibility, and downstream consumers filter by full `procedure_date` anyway. **This is a recorded non-goal, not a latent gap** — surfacing year drift via EXI-290 is out of scope for this feature.
- [ ] **The reserved type and the default type**: a mapping accepts both the reserved type « Import » (see R22 of procedure-type.md) and the default type `imported-from-excel`; both store the same type on the procedure (EXI-131) but are saved as different mappings (ticket #608, with the owner).
- [ ] **A failed mapping save** (EXI-230): what the user's mapping becomes when its save fails is not stated.

### Execute-time validation and reporting

**EXI-270 — Sheet-based selection (backend)**: Import selection is by sheet, not by month derived from the date: procedure rows are kept by their source sheet's canonical name, as the parser assigned it. Dates are checked by EXI-280 and EXI-281.

**EXI-280 — Execute-time date format validation (backend)**: For each procedure row in a selected sheet, `procedure_date` (required) MUST parse as a calendar date in `YYYY-MM-DD` format. `confirmed_payment_date` (when present and non-empty) MUST also parse. A row whose `procedure_date` or `confirmed_payment_date` is malformed is skipped and recorded in the execute-time skip report defined by EXI-290 (which is the rule that owns user-visible reporting). The other procedures in the import proceed normally; the import as a whole does not abort because of a single malformed row.

**EXI-281 — Procedure date must match sheet's nominal month (backend)**: For each procedure row in a selected sheet, after `procedure_date` parses successfully (per EXI-280), the parsed date's month MUST equal the source sheet's nominal month — a row in the `Jan` sheet must have a January `procedure_date`, `Fév` → February, etc. The sheet-name → nominal-month mapping covers both abbreviated and full canonical forms per EXI-010 (e.g. both `Jan` and `Janvier` map to January). A row whose parsed `procedure_date.month` differs from its sheet's nominal month is skipped and recorded in the execute-time skip report defined by EXI-290. A row whose sheet name maps to no month is reported the same way, though EXI-010 means detection should never select one. The year is not checked — the workbook is single-year by convention and the year is not part of sheet identity (see the Open Question on year-drift acceptance). `confirmed_payment_date` is NOT subject to this constraint: a procedure performed in January can be confirmed-paid in February (or any other month), and that is legitimate data.

**EXI-290 — Execute-time skip rows (backend)**: Every row of a selected sheet that the import leaves out is reported with its sheet, its row and its cause, the first that applies in EXI-180's order: its month is blocked (EXI-160), its patient reference matches no patient of the workbook, its amount has no mapping (EXI-150), a date fails its format (EXI-280) or its month (EXI-281); later execute-time causes fall under this rule too. Each row has one entry. The cause carries its evidence — the month for a blocked month, the amount for an amount with no mapping, the raw cell text for a format failure (verbatim, as it appears in the file), the parsed date (`YYYY-MM-DD`) for a month mismatch, none for an unmatched patient — and no display text. A row of a sheet the user did not select is not reported. These rows join the parse-time ones in the import's report (EXI-220; merged on screen today, #429).

---

## Workflow

```
[User selects an Excel file]
          │
          ▼
[Parse the Excel file] (backend)
  → Read Patiente / Secu / monthly sheets
  → Assign temp_ids (patients, funds, procedures)
  → Group by amount → procedure_type_tmp_id
  → Collect skipped lines
          │
          ▼
[Sheets and type mapping] — chosen on screen (mocks)
  → the sheets to import (EXI-110), the amount → type mapping (EXI-130, EXI-150)
  → the saved mapping returned, deleted types filtered out (EXI-240, EXI-250)
  → the mapping saved (EXI-230)
          │
          ▼
[Run the import] (backend)
  → Refuse if the mapping names a type that does not exist (EXI-151)
  → Resolve patients (reuse or create)
  → Resolve funds (reuse or create)
  → For each selected sheet: check blocking (EXI-160); list the non-blocked months to replace (EXI-170)
  → Delete the procedures of the months to replace
  → For each procedure row in a selected sheet:
       → Skip + report a row of a blocked month, an unmatched patient or no mapping (EXI-290)
       → Validate date formats (EXI-280); skip + report on failure
       → Validate procedure_date.month == sheet.month (EXI-281); skip + report on mismatch
       → Create with the mapped type (status Created / ImportDirectlyPaid / ImportFundPaid per EXI-200)
  → Update patient tracking fields
          │
          ▼
[Result] (EXI-210)
  → counters: patients / funds / procedures (created / skipped / deleted), blocked months
  → the report: missing sheets, skipped lines of both origins (EXI-220, EXI-290)
```
