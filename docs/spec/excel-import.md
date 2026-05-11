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

**EXI-040 (R4) — Fund validation (backend)**: The fund's identifier and name are required (non-empty). The address is optional. The deduplication key is the exact fund identifier.

### Temporary identification

**EXI-050 (R5) — Temporary identifiers (backend)**: At parsing time, each entity (patient, fund, procedure) receives a temporary identifier (`temp_id`) as a UUID. These identifiers let procedures be linked to their patients and funds without real DB IDs. `temp_id`s are valid only for the current parsing session.

**EXI-060 (R6) — Temporary procedure-type identifier (backend)**: A `procedure_type_tmp_id` (UUID) is assigned to each procedure based on its amount. All procedures with the same amount share the same `procedure_type_tmp_id`. This grouping by amount lets the user map each unique amount to a real procedure type.

**EXI-070 (R7) — Re-parsing forbidden (backend + frontend)**: `procedure_type_tmp_id`s are generated randomly at parsing time. Re-parsing the same file would produce different UUIDs, invalidating any type mapping the user has already established. The frontend therefore keeps the parse response in memory and never re-runs parsing a second time.

### Deduplication

**EXI-080 (R8) — Patient deduplication (backend)**: During parsing, patients are deduplicated in memory by SSN (if valid) or by lowercased name. At import-execution time, the database lookup follows the same priority:

- If the SSN is present and a patient with that SSN exists in the DB → reuse (no creation).
- If the SSN is present but not found in the DB → create.
- If the SSN is missing → fall back to a case-insensitive name lookup. Among matches, a patient with a non-empty SSN wins over one without; remaining ties resolve via DB iteration order (non-deterministic). If still no match, the patient is created. This prevents the same blank-SSN patient from being recreated every time the workbook is re-imported.

**EXI-090 (R9) — Fund deduplication (backend)**: During parsing, funds are deduplicated by exact identifier. At execution time, each fund is looked up in the DB by identifier:

- If a fund with the same identifier exists → reuse (no creation).
- Otherwise → create.

**EXI-100 (R10) — Procedure deduplication by month (backend)**: Procedures are not deduplicated individually. Duplicate handling is done at the whole-month level (see EXI-170 and EXI-180).

### Month selection

**EXI-110 (R11) — Selecting which months to import (frontend)**: After parsing, the user selects which months to import via a checkbox list. All months detected in the parsed procedures are offered. By default, all are selected. Only selected months are passed to the execution command. The "Continue" button is disabled if no month is selected. **Special case**: if no procedure was parsed (file with no monthly sheets, or all lines skipped), the month-selection and type-mapping steps are skipped — the import runs without further steps.

### Procedure-type mapping

**EXI-120 (R12) — Mapping pre-fill (frontend)**: For each unique amount detected in the parsed procedures, the user associates a procedure type. The frontend automatically pre-fills each amount with the first available type (or `imported-from-excel` if no type exists). All amounts therefore always have a value in the mapping sent.

**EXI-130 (R13) — Default type (frontend)**: The user can choose the special type `imported-from-excel` for an amount. Matching procedures are created but associated with this generic type with no precise label.

**EXI-140 (R14) — Inline procedure-type creation (frontend)**: The user can create a new procedure type directly from the mapping screen, via a modal. The default amount is pre-filled with the matching value. The created type is immediately available in the mapping list.

**EXI-150 (R25) — Procedures skipped if amount missing from mapping (backend)**: If an amount is missing from the mapping received at execution time, all procedures matching that amount are skipped.

### Reconciled-data protection

**EXI-160 (R15) — Blocked month (backend)**: Before importing a selected month, the system checks whether procedures exist with an advanced reconciliation status (`RECONCILIATED` or `FUND_PAYED`) for that month. If so, the entire month is **blocked**: no procedure for that month is deleted or recreated. Blocked months are reported in the result.

**EXI-170 (R16) — Pre-import deletion (backend)**: If a month is not blocked (see EXI-160), **all** existing procedures for that month are permanently deleted before the new data is imported. This mechanism allows a corrected month to be re-imported without accumulating duplicates.

### Import orchestration

**EXI-180 (R17) — Execution order (backend)**: Import execution follows a strict order:

1. Resolve and create patients (existing reused, new ones created)
2. Resolve and create funds (existing reused, new ones created)
3. Validate months: identify blocked months and delete procedures of allowed months
4. Create procedures: for each procedure whose month is allowed, with the resolved patient and the mapped type

**EXI-190 (R18) — Patient tracking-field update (backend)**: After procedures are created, the patient's tracking fields (`latest_date`, `latest_procedure_type`, `latest_fund`, `latest_procedure_amount`) are updated to reflect the most recent imported procedure (see R19 of procedure-orchestration.md).

**EXI-200 (R19) — Initial status of imported procedures (backend)**: The initial status is computed by the orchestration based on the payment data present in the Excel (see R15 and R16 of procedure-orchestration.md):

- Procedure with no confirmed payment → `Created`
- Procedure with confirmed payment, ES/CH method or no fund → `ImportDirectlyPayed`
- Procedure with confirmed payment, other method, with fund → `ImportFundPayed`

Procedures in `Created` are then eligible for fund reconciliation (see R1 of fund-payment-auto-match.md).

### Result and reporting

**EXI-210 (R20) — Result report (backend + frontend)**: At the end of the import, a summary is displayed containing:

- Patients created / reused
- Funds created / reused
- Procedures created / skipped / deleted
- List of blocked months (if any)

**EXI-220 (R21) — Parsing report (backend + frontend)**: At the end of parsing, a detailed report is reachable from the result screen. It contains two sections:

- **Missing sheets**: list of monthly sheets expected but not found in the Excel file.
- **Skipped lines**: lines rejected (see EXI-020), organized by monthly sheet as tabs. Lines skipped because of an `#N/A` name or empty row are hidden in the display (too numerous and not informative).

This report is informative and non-blocking.

### Mapping memory

**EXI-230 (R22) — Mapping persistence (frontend)**: When the mapping step is confirmed, the user's choices (amount → procedure type) are persisted in the database.

**EXI-240 (R23) — Reload as defaults (frontend)**: On a later import, the saved preferences are offered as defaults on the mapping screen. The user can edit any value — there is no auto-validation.

**EXI-250 (R24) — Filtering of deleted types (backend)**: Mapping preferences are filtered before being passed to the frontend: only mappings whose procedure type still exists (not deleted) or whose value is `imported-from-excel` are returned. If a type was deleted since the last import, its mapping is excluded — the UI then falls back to the default type (see EXI-120).

### Last-folder memory

**EXI-260 (R25) — Last-folder memory (frontend)**: When the user successfully picks an Excel file from the OS file dialog, the parent folder of the picked file is persisted in `localStorage` under the per-feature key `import-last-folder:excel`. On the next Excel import, that folder is passed to the dialog as `defaultPath` so the user starts where they left off. Each of the three import flows (Excel, fund PDF, bank PDF) has its own slot — picking a bank-statement PDF never moves the Excel default. Cancelling the dialog leaves the persisted folder untouched. If the persisted folder is no longer reachable, the native dialog opens at the OS's own fallback (home or last-used location depending on platform); no explicit fallback resolution happens in the app.

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
[Month selection] (frontend)
  → List of detected months, all checked by default
  → User unchecks months to exclude
          │
          ▼
[Procedure-type mapping] (frontend)
  → Load saved preferences (backend filters out deleted types)
  → Table: amount → procedure type (pre-filled with preferences or first available type)
  → Options: existing type / create new / generic type
  → Inline creation via modal
  → Save choices on confirmation
          │
          ▼
[Run the import] (backend)
  → Resolve patients (reuse or create)
  → Resolve funds (reuse or create)
  → Validate months: blocked (RECONCILIATED/FUND_PAYED) vs allowed
  → Permanently delete procedures for allowed months
  → Create procedures (status Created / ImportDirectlyPayed / ImportFundPayed depending on payment data)
  → Update patient tracking fields
          │
          ▼
[Result report] (frontend)
  → Counters: patients / funds / procedures (created / reused / skipped / deleted)
  → Warning: blocked months
  → Access to the parsing report (skipped lines)
          │
          ▼
[End — back to home or new import]
```
