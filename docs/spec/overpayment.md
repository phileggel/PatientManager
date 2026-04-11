# Business Rules — Overpayment Management (Overpayments)

## Context

An overpayment ("indu") occurs when a fund (insurance body) has paid for an act that was not due, or paid too much, and requests a refund weeks or months later. This feature allows the practitioner to manually select a previously paid procedure, record the refund request, and track the actual repayment.

Recording an overpayment creates a "mirror" negative record across the entire chain (Procedure -> Fund Payment -> Bank Transfer) to maintain accounting consistency.

---

## Entity Definition

### ProcedureRefund

Represents the link between the original paid procedure and the refund procedure created to offset it.

| Field                 | Business meaning                                                          |
| --------------------- | ------------------------------------------------------------------------- |
| `source_procedure_id` | The original procedure that was overpaid.                                 |
| `refund_procedure_id` | The new procedure created with a negative amount to represent the refund. |
| `refund_date`         | The date the refund was recorded/paid.                                    |
| `reason`              | Optional text explaining why the refund was requested (max 255 chars).    |

---

## Business Rules

### Eligibility and Initiation

**REF-010 — Refund Eligibility (frontend + backend)**: Only procedures with a final payment status (`FundPayed`, `PartiallyFundPayed`) are eligible for a refund. Procedures in any other status cannot be selected as a source for an overpayment.

**REF-011 — Full Refund Only (backend)**: An overpayment always covers the full amount of the original procedure (the amount that was paid). Partial refunds are not supported in this manual flow.

**REF-012 — Refund Date Validation (frontend + backend)**: The `refund_date` must be a valid date, not in the future, and cannot be earlier than the `procedure_date` of the source procedure.

**REF-013 — Reason Field Validation (frontend + backend)**: The `reason` field is optional, but if provided, it must not exceed 255 characters.

### Creation of Refund Records

**REF-020 — Atomic Refund Creation (backend)**: Creating an overpayment is an atomic operation that generates three linked records:

1. **A Refund Procedure**: A new `Procedure` with the same patient and fund as the source, but with a negative `procedure_amount` (equal to `-source.procedure_amount`). Status: `OverpaymentRefund` (direct, no transition).
2. **A Refund Fund Payment Group**: A new `FundPaymentGroup` containing only the refund procedure, with a negative `total_amount`.
3. **A Refund Bank Transfer**: A new `BankTransfer` linked to the refund group, with a negative `amount`.

**REF-021 — Refund Payment Methods (frontend + backend)**: When recording a refund, the user must select a payment method. Supported methods for refunds are `CREDIT_CARD`, `CHECK`, and `BANK_TRANSFER`.

**REF-022 — Refund Link (backend)**: Every overpayment must be recorded in the `ProcedureRefund` table, linking the source procedure to the refund procedure and storing the provided reason.

### Status Transitions

**REF-030 — Status Updates (backend)**: Upon successful creation of the refund:

- The **Source Procedure** status changes to `Overpaid`.
- The **Refund Procedure** status is set to `OverpaymentRefund`.
- The **Refund Fund Payment Group** status is set to `BankPayed` (locked).

### Deletion

**REF-040 — Deletion of Overpayment (backend)**: Deleting the bank transfer associated with an overpayment reverts the source procedure to its previous status (`FundPayed` or `PartiallyFundPayed`), removes the refund procedure, the refund group, and the link entry. This operation must be performed within a single backend method to ensure atomicity.

**REF-041 — Deletion of Overpaid Source Procedure (backend)**: A source procedure with `Overpaid` status cannot be deleted directly. Its linked overpayment (refund bank transfer) must be deleted first.

**REF-042 — Deletion of Refund Procedure (backend)**: A refund procedure with `OverpaymentRefund` status cannot be deleted directly. Deletion must be initiated by deleting its associated bank transfer, as described in REF-040.

---

## Workflow

```text
[User selects a paid procedure]
  → Checks eligibility (REF-010)
          │
          ▼
[User enters refund details]
  → Selection of payment date (REF-012)
  → Selection of payment method (REF-021)
  → Optional reason (REF-013)
          │
          ▼
[Validation and Creation] (backend atomic operation)
  → Create negative Procedure (REF-020)
  → Create negative FundPaymentGroup (REF-020)
  → Create negative BankTransfer (REF-020)
  → Create ProcedureRefund link (REF-022)
  → Update statuses: Source -> Overpaid, Refund -> OverpaymentRefund (REF-030)
```

---

## UX Draft

### Entry Point

A "Refund" button will be available in the EditProcedureModal when the procedure has a status of `FundPayed` or `PartiallyFundPayed`.

### Main Component

A dedicated "Record Overpayment" Modal dialog.

### States

- **Loading**: The modal displays a loading spinner while processing the refund.
- **Error**: Validation errors (REF-012, REF-013) are displayed inline; backend errors show a snackbar.
- **Success**: A success toast is shown, and the modal closes after a successful refund.

### User Flow

1. User opens the EditProcedureModal for an eligible procedure and clicks "Refund".
2. The "Record Overpayment" modal opens, pre-filled with source details.
3. User fills in Repayment Date, Payment Method, and optional Reason.
4. User clicks "Confirm Refund".
5. A Confirmation Dialog appears, summarizing the financial impact:
   - **Source**: [Patient Name] ([Original Amount]) → Status: `Overpaid`.
   - **Refund**: New record of -[Original Amount] on [Repayment Date].
   - **Accounting**: "This will create a negative bank transfer and fund payment group."
6. Upon user confirmation, the refund process is initiated.
7. After success, the source procedure's status badge updates to `Overpaid`.

---

## Open Questions

None — all questions have been resolved.

---

## Future Improvements — Partial Overpayments

While the current version (V1) supports only full refunds (REF-011), the system should eventually allow partial overpayment management.

### Proposed Changes

**REF-050 (Extension) — Partial Refund Support**:
The user will be able to input a specific `refund_amount`.

- The amount must be greater than 0 and less than or equal to the `source.procedure_amount`.
- The **Refund Procedure** will be created with `-refund_amount`.

**REF-031 (Extension) — Status Logic**:
If a partial refund is processed:

- If `refund_amount == source.procedure_amount`: Status = `Overpaid`.
- If `refund_amount < source.procedure_amount`: Status = `PartiallyOverpaid`.

**New Complexity: Multiple Refunds**:

- A single `source_procedure` could potentially have multiple `ProcedureRefund` entries (e.g., two successive partial claims from the fund).
- **Validation**: The sum of all `refund_amount` for a single source must not exceed the original `source.procedure_amount`.

**UI Impact (REF-050)**:

- The "Record Overpayment" modal will include an "Amount to Refund" input field, pre-filled with the total amount by default.
