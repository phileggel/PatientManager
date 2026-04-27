# Business Rules — Excel Import (excel-import)

## Context

A practitioner has a historical Excel file containing their patients, funds, and monthly procedures. This feature lets the user import this file to initialize or update the database, while resolving duplicates, mapping procedure types, and protecting data that is already reconciled.

---

## Business Rules

### Excel file structure

**R1 — Expected sheets (backend)**: The parser recognizes three kinds of sheets in the Excel file:

- **`Patiente` sheet** (optional): list of patients with name (col A), SSN (col C). Column D (latest fund identifier) is read but not persisted at import time. If the sheet is absent, patients are inferred from the monthly sheets.
- **`Secu` sheet** (optional): list of funds with identifier (col A), name (col B). The address (col C) is read but not persisted — only the identifier and the name are stored.
- **Monthly sheets** (optional): named `Jan`, `Fév`, `Mars`, `Avr`, `Mai`, `Juin`, `Juil`, `Août`, `Sep`, `Oct`, `Nov`, `Déc` (or full names — these abbreviations match the user's actual French Excel file). Each sheet represents one month. Columns are detected dynamically from a header row (row 2): `CAISSE`, `TARIF`, `DATE` are mandatory; `T` (payment method), `REMBSE` (confirmed payment date), `Versé` (actual amount paid), and `En attente` are optional.

**R2 — Lines skipped during parsing (backend)**: A line on a monthly sheet is skipped (without a blocking error) in the following cases:

- Patient name empty, `#N/A`, or not found in the parsed patient list
- Amount missing, non-numeric, or ≤ 0
- Date missing or in an unrecognized format (`DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, or Excel serial number)
- Fund referenced but not found in the parsed fund list
- Insufficient column count

All skipped lines are collected in a parsing report displayed to the user at the end of the import.

### Data validation

**R3 — Patient SSN validation (backend)**: The SSN is optional. If provided, it must contain exactly 13 ASCII digits. Three cases:

- Valid SSN (13 digits): primary deduplication key.
- Missing or empty SSN: deduplicate by lowercased name.
- SSN provided but invalid: stored in the name as `"{name} (code: {ssn})"` for traceability, and deduplication is by name.

**R4 — Fund validation (backend)**: The fund's identifier and name are required (non-empty). The address is optional. The deduplication key is the exact fund identifier.

### Temporary identification

**R5 — Temporary identifiers (backend)**: At parsing time, each entity (patient, fund, procedure) receives a temporary identifier (`temp_id`) as a UUID. These identifiers let procedures be linked to their patients and funds without real DB IDs. `temp_id`s are valid only for the current parsing session.

**R6 — Temporary procedure-type identifier (backend)**: A `procedure_type_tmp_id` (UUID) is assigned to each procedure based on its amount. All procedures with the same amount share the same `procedure_type_tmp_id`. This grouping by amount lets the user map each unique amount to a real procedure type.

**R7 — Re-parsing forbidden (backend + frontend)**: `procedure_type_tmp_id`s are generated randomly at parsing time. Re-parsing the same file would produce different UUIDs, invalidating any type mapping the user has already established. The frontend therefore keeps the parse response in memory and never re-runs parsing a second time.

### Deduplication

**R8 — Patient deduplication (backend)**: During parsing, patients are deduplicated in memory by SSN (if valid) or by lowercased name. At import-execution time, the database lookup is **only by SSN**:

- If the SSN is present and a patient with that SSN exists in the DB → reuse (no creation).
- If the SSN is present but not found in the DB → create.
- If the SSN is missing → no DB lookup, the patient is always created (name-based deduplication only applies in memory during parsing).

**R9 — Fund deduplication (backend)**: During parsing, funds are deduplicated by exact identifier. At execution time, each fund is looked up in the DB by identifier:

- If a fund with the same identifier exists → reuse (no creation).
- Otherwise → create.

**R10 — Procedure deduplication by month (backend)**: Procedures are not deduplicated individually. Duplicate handling is done at the whole-month level (see R16 and R17).

### Month selection

**R11 — Selecting which months to import (frontend)**: After parsing, the user selects which months to import via a checkbox list. All months detected in the parsed procedures are offered. By default, all are selected. Only selected months are passed to the execution command. The "Continue" button is disabled if no month is selected. **Special case**: if no procedure was parsed (file with no monthly sheets, or all lines skipped), the month-selection and type-mapping steps are skipped — the import runs without further steps.

### Procedure-type mapping

**R12 — Mapping pre-fill (frontend)**: For each unique amount detected in the parsed procedures, the user associates a procedure type. The frontend automatically pre-fills each amount with the first available type (or `imported-from-excel` if no type exists). All amounts therefore always have a value in the mapping sent.

**R13 — Default type (frontend)**: The user can choose the special type `imported-from-excel` for an amount. Matching procedures are created but associated with this generic type with no precise label.

**R14 — Inline procedure-type creation (frontend)**: The user can create a new procedure type directly from the mapping screen, via a modal. The default amount is pre-filled with the matching value. The created type is immediately available in the mapping list.

**R25 — Procedures skipped if amount missing from mapping (backend)**: If an amount is missing from the mapping received at execution time, all procedures matching that amount are skipped.

### Reconciled-data protection

**R15 — Blocked month (backend)**: Before importing a selected month, the system checks whether procedures exist with an advanced reconciliation status (`RECONCILIATED` or `FUND_PAYED`) for that month. If so, the entire month is **blocked**: no procedure for that month is deleted or recreated. Blocked months are reported in the result.

**R16 — Pre-import deletion (backend)**: If a month is not blocked (see R15), **all** existing procedures for that month are permanently deleted before the new data is imported. This mechanism allows a corrected month to be re-imported without accumulating duplicates.

### Import orchestration

**R17 — Execution order (backend)**: Import execution follows a strict order:

1. Resolve and create patients (existing reused, new ones created)
2. Resolve and create funds (existing reused, new ones created)
3. Validate months: identify blocked months and delete procedures of allowed months
4. Create procedures: for each procedure whose month is allowed, with the resolved patient and the mapped type

**R18 — Patient tracking-field update (backend)**: After procedures are created, the patient's tracking fields (`latest_date`, `latest_procedure_type`, `latest_fund`, `latest_procedure_amount`) are updated to reflect the most recent imported procedure (see R19 of procedure-orchestration.md).

**R19 — Initial status of imported procedures (backend)**: The initial status is computed by the orchestration based on the payment data present in the Excel (see R15 and R16 of procedure-orchestration.md):

- Procedure with no confirmed payment → `Created`
- Procedure with confirmed payment, ES/CH method or no fund → `ImportDirectlyPayed`
- Procedure with confirmed payment, other method, with fund → `ImportFundPayed`

Procedures in `Created` are then eligible for fund reconciliation (see R1 of fund-payment-auto-match.md).

### Result and reporting

**R20 — Result report (backend + frontend)**: At the end of the import, a summary is displayed containing:

- Patients created / reused
- Funds created / reused
- Procedures created / skipped / deleted
- List of blocked months (if any)

**R21 — Parsing report (backend + frontend)**: At the end of parsing, a detailed report is reachable from the result screen. It contains two sections:

- **Missing sheets**: list of monthly sheets expected but not found in the Excel file.
- **Skipped lines**: lines rejected (see R2), organized by monthly sheet as tabs. Lines skipped because of an `#N/A` name or empty row are hidden in the display (too numerous and not informative).

This report is informative and non-blocking.

### Mapping memory

**R22 — Mapping persistence (frontend)**: When the mapping step is confirmed, the user's choices (amount → procedure type) are persisted in the database.

**R23 — Reload as defaults (frontend)**: On a later import, the saved preferences are offered as defaults on the mapping screen. The user can edit any value — there is no auto-validation.

**R24 — Filtering of deleted types (backend)**: Mapping preferences are filtered before being passed to the frontend: only mappings whose procedure type still exists (not deleted) or whose value is `imported-from-excel` are returned. If a type was deleted since the last import, its mapping is excluded — the UI then falls back to the default type (see R12).

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
