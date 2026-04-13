# Business Rules — Overpayment Management (REF)

## Context

An overpayment ("indu") occurs when a fund (insurance body) has paid for an act that was not due, or paid too much, and requests a refund weeks or months later. This feature allows the practitioner to manually select a previously paid procedure, record the refund request, and track the actual repayment.

Recording an overpayment creates a "mirror" negative record across the entire chain (Procedure → Fund Payment → Bank Transfer) to maintain accounting consistency.

---

## Prerequisites

The following domain changes are required before this feature can be implemented:

1. **`PaymentStatus` enum extension**: Add `Overpaid` and `OverpaymentRefund` to the `Procedure` payment status enum and the corresponding SQLite migration. The procedure lifecycle table in `procedure-orchestration-spec.md` must also be updated to include these statuses (already done as part of this spec).
2. **`TransferType` enum extension**: Add an `OutgoingWire` variant to the `BankTransfer.transfer_type` enum and the corresponding migration. This variant represents an outgoing refund payment (distinct from `Fund`, which is an incoming insurance payment). It is only creatable via the overpayment flow and must not be exposed in the bank statement manual-match UI.
3. **POC R5 update**: The procedure deletion guard in `procedure-orchestration-spec.md` (POC R5) must be extended to include `Overpaid` and `OverpaymentRefund`. REF-220 and REF-230 are the authoritative definitions; POC R5 must cross-reference them.
4. **`ProcedureRefund` repository**: Although the entity spans multiple contexts, its persistence (repository trait, migration, SQLite implementation) is owned by the `context/procedure/` bounded context, as the `ProcedureRefund` record is a direct extension of the procedure domain.

---

## Entity Definition

### ProcedureRefund

Represents the link between the original paid procedure and the refund procedure created to offset it.

**Context placement**: `use_cases/overpayment/` orchestrator; repository owned by `context/procedure/`.

| Field                     | Business meaning                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_procedure_id`     | The original procedure that was overpaid.                                                                                                                               |
| `refund_procedure_id`     | The new procedure created with a negative amount to represent the refund.                                                                                               |
| `refund_date`             | The date the refund was recorded/paid.                                                                                                                                  |
| `reason`                  | Optional text explaining why the refund was requested (max 255 chars).                                                                                                  |
| `previous_payment_status` | The source procedure's payment status before it became `Overpaid` (`FundPayed` or `PartiallyFundPayed`). Used by REF-210 to revert the source to its exact prior state. |

---

## Business Rules

### Eligibility and Initiation

**REF-010 — Refund Eligibility (frontend + backend)**: Only procedures with a final payment status (`FundPayed`, `PartiallyFundPayed`) are eligible for a refund. Procedures in any other status cannot be selected as a source for an overpayment.

**REF-020 — Full Refund Only (backend)**: An overpayment always covers the full amount of the original procedure. Partial refunds are not supported in V1. The backend rejects any request where the submitted amount differs from `source.procedure_amount`, returning a validation error.

**REF-030 — Refund Date Validation (frontend + backend)**: The `refund_date` must be a valid date, not in the future, and cannot be earlier than the `confirmed_payment_date` of the source procedure.

**REF-040 — Reason Field Validation (frontend + backend)**: The `reason` field is optional, but if provided, it must not exceed 255 characters.

### Creation of Refund Records

**REF-050 — Atomic Refund Creation (backend)**: Creating an overpayment is a single database transaction. If any step fails, the entire operation rolls back and no record is persisted.

**REF-060 — Refund Payment Method Validation (frontend + backend)**: The user must select a payment method for the refund. Accepted values are `CreditCard`, `Check`, and `OutgoingWire` (domain enum names). `Cash` and `Fund` are not accepted for refunds: `Fund` is an incoming payment type and `Cash` cannot be remitted to an insurance body. The backend rejects any other value with a validation error.

**REF-070 — Bank Account Selection (frontend + backend)**: The refund bank transfer must be linked to a bank account. Resolution logic:
- If **no bank account exists** in the system: the "Refund" button is disabled and a message is shown — "A bank account must be created before recording a refund."
- If **exactly one bank account** exists: the selector is pre-filled with it automatically.
- If **multiple bank accounts** exist: the selector is pre-filled with the bank account from the source procedure's original bank transfer. "Resolvable" means the source has a linked `BankTransfer` whose `bank_account_id` exists as a non-deleted record in the `bank_account` table. If not resolvable, the selector is shown empty and the user must pick one.

The backend rejects the request if no `bank_account_id` is provided.

**REF-080 — OutgoingWire Transfer Type Exclusivity (backend)**: The `OutgoingWire` variant of `TransferType` is only creatable through the overpayment flow. The bank statement manual-match command rejects any attempt to create a bank transfer with `transfer_type = OutgoingWire`.

**REF-090 — Create Refund Procedure (backend)**: A new `Procedure` is created with:
- Same `patient_id`, `fund_id`, and `procedure_type_id` as the source procedure.
- `procedure_amount` = `-source.procedure_amount`.
- `payment_status` = `OverpaymentRefund` (direct assignment, no lifecycle transition).
- `procedure_date` = `refund_date`.

**REF-100 — Create Refund Fund Payment Group (backend)**: A new `FundPaymentGroup` is created containing only the refund procedure, with:
- `fund_id` from the source procedure.
- `total_amount` = `-source.procedure_amount`.
- `payment_date` = `refund_date`.
- `status` = `BankPayed` (direct assignment, bypasses normal reconciliation flow intentionally).
- `is_locked` = `true`.
- One `FundPaymentLine` entry linking the refund procedure (REF-090) to this group, consistent with the invariant that all `FundPaymentGroup` records contain at least one line.

**REF-110 — Create Refund Bank Transfer (backend)**: A new `BankTransfer` is created linked to the refund `FundPaymentGroup` (REF-100), with:
- `amount` = `-source.procedure_amount`.
- `transfer_date` = `refund_date`.
- `transfer_type` = the payment method selected by the user (REF-060).
- `bank_account_id` = the bank account selected by the user (REF-070).

**REF-120 — Bank Transfer Link Creation (backend)**: A `BankTransferLink` record is created linking the refund bank transfer (REF-110) to the refund fund payment group (REF-100), maintaining the junction table invariant that all `BankPayed` groups have a corresponding link entry.

**REF-130 — Refund Link (backend)**: Every overpayment must be recorded in the `ProcedureRefund` table, linking the source procedure to the refund procedure, storing the provided reason, and storing the source procedure's current `payment_status` as `previous_payment_status` at the moment of creation.

**REF-140 — ProcedureRefund Immutability (backend)**: Once created, a `ProcedureRefund` record is immutable. Its `reason`, `refund_date`, and linked procedure IDs cannot be updated. Modifications must go through cancellation (REF-210) and re-creation.

**REF-150 — ProcedureRefund Repository Ownership (backend)**: The `ProcedureRefund` entity's repository trait, SQLite implementation, and migration are owned by `context/procedure/`. The `use_cases/overpayment/` orchestrator depends on this repository through the standard `Arc<dyn ProcedureRefundRepository>` injection pattern.

### Status Transitions

**REF-160 — Source Procedure Status Update (backend)**: Upon successful completion of the atomic refund creation (REF-050), the source procedure's `payment_status` changes to `Overpaid`.

**REF-170 — Refund Procedure Type Propagation (backend)**: If the `procedure_type_id` of an `Overpaid` source procedure is updated, the linked `OverpaymentRefund` procedure's `procedure_type_id` is updated to match in the same operation. This logic is implemented by augmenting the existing `update_procedure` Tauri command in `use_cases/procedure_orchestration/`: the orchestrator checks whether the updated procedure has `Overpaid` status; if so, it queries `ProcedureRefund` by `source_procedure_id` to locate the linked refund procedure and applies the same `procedure_type_id` update atomically. For all other statuses, the orchestrator skips this step.

### Display

**REF-180 — Status Badge Colors (frontend)**: The `Overpaid` and `OverpaymentRefund` statuses use `bg-m3-error-container / text-m3-on-error-container` badge tokens, distinct from all other payment status badges.

**REF-190 — Overpaid Procedure Modal Mode (frontend)**: A procedure with `Overpaid` status opens in a dedicated partial-edit mode in `EditProcedureModal`:
- `procedure_type_id` is editable and required; changing it and clicking "Save" fires the existing `update_procedure` command (augmented per REF-170). The field must not be empty before submission.
- All other fields are read-only.
- The "Cancel Refund" button is present (triggers REF-210).
- The "Delete" button is absent.

**REF-200 — OverpaymentRefund Procedure Modal Mode (frontend)**: A procedure with `OverpaymentRefund` status opens in full read-only mode in `EditProcedureModal`:
- All fields are read-only.
- The "Cancel Refund" button is present (triggers REF-210).
- The "Delete" button is absent.

### Deletion

**REF-210 — Cancellation of Overpayment (backend)**: Cancelling a refund is a single database transaction, executed in reverse creation order. The cancellation command always receives the `source_procedure_id` as its identifier. When triggered from the `OverpaymentRefund` modal (REF-200), the frontend resolves the `source_procedure_id` from the `ProcedureRefund` record loaded with the modal. The backend looks up the `ProcedureRefund` record by `source_procedure_id` to obtain all related IDs before proceeding:
1. Revert the source procedure's `payment_status` to the value stored in `ProcedureRefund.previous_payment_status`.
2. Delete the `ProcedureRefund` link entry.
3. Delete the `BankTransferLink` entry.
4. Delete the refund bank transfer.
5. Delete the refund fund payment group.
6. Delete the refund procedure.

If any step fails, the entire operation rolls back.

**REF-220 — Deletion of Overpaid Source Procedure (backend)**: A source procedure with `Overpaid` status cannot be deleted directly. Its linked overpayment must be cancelled first (REF-210).

**REF-230 — Deletion of Refund Procedure (backend)**: A refund procedure with `OverpaymentRefund` status cannot be deleted directly. Cancellation must be initiated via the procedure detail modal as described in REF-210.

**REF-240 — Refund Fund Payment Group Deletion Guard (backend)**: The refund `FundPaymentGroup` (created by REF-100) cannot be deleted directly via `delete_fund_payment_group`. It can only be removed as part of the REF-210 cancellation cascade. The backend rejects any direct deletion attempt with an explicit error.

---

## Workflow

```text
[User selects a paid procedure]
  → Checks eligibility (REF-010)
  → Checks bank account availability (REF-070)
          │
          ▼
[User enters refund details]
  → Refund date (REF-030)
  → Payment method (REF-060)
  → Bank account, pre-filled or empty (REF-070)
  → Optional reason (REF-040)
          │
          ▼
[Validation and Creation — single transaction (REF-050)]
  → Create Refund Procedure (REF-090)
  → Create Refund Fund Payment Group (REF-100)
  → Create Refund Bank Transfer (REF-110)
  → Create BankTransferLink (REF-120)
  → Create ProcedureRefund link (REF-130)
  → Update source procedure status → Overpaid (REF-160)

[Cancellation — single transaction (REF-210)]
  → User clicks "Cancel Refund" on Overpaid or OverpaymentRefund procedure
  → Revert source status (from ProcedureRefund.previous_payment_status)
  → Delete ProcedureRefund link
  → Delete BankTransferLink
  → Delete refund bank transfer
  → Delete refund fund payment group
  → Delete refund procedure
```

---

## UX Draft

### Entry Point — Create Refund

A "Refund" button is available in the `EditProcedureModal` when the procedure status is `FundPayed` or `PartiallyFundPayed`.
- If no bank account exists in the system, the button is disabled with a tooltip message (REF-070).
- The button is hidden when the status is `Overpaid` or `OverpaymentRefund`.

### Entry Point — Cancel Refund

A "Cancel Refund" button is available in the `EditProcedureModal` for:
- The **source procedure** when its status is `Overpaid` (REF-190).
- The **refund procedure** when its status is `OverpaymentRefund` (REF-200).

### States

- **Refund button disabled**: When no bank account exists in the system, the "Refund" button is disabled and shows a tooltip — "A bank account must be created before recording a refund." (REF-070). The modal does not open.
- **Loading (create)**: The modal displays a loading spinner while processing the refund.
- **Loading (cancel)**: The confirmation dialog displays a loading spinner while the cancellation cascade runs.
- **Loading (procedure type save)**: The save button is disabled and shows a spinner while the `procedure_type_id` update and REF-170 propagation are in progress.
- **Error (create)**: Validation errors (REF-030, REF-040) are displayed inline; backend errors show a snackbar. The modal remains open.
- **Error (cancel)**: If the cancellation fails, the confirmation dialog closes and a snackbar error is shown. No partial state is persisted (full rollback per REF-210).
- **Error (procedure type save)**: A snackbar error is shown; the modal remains open with the previously entered value.
- **Success (create)**: A success toast is shown and the modal closes.
- **Success (cancel)**: A success toast is shown and the modal closes. The source procedure's status badge reverts.
- **Success (procedure type save)**: A success toast is shown and the modal closes.

### User Flow — Create Refund

1. User opens the `EditProcedureModal` for an eligible procedure and clicks "Refund".
2. The "Record Overpayment" modal opens, pre-filled with source details.
3. User fills in:
   - **Repayment Date** (REF-030)
   - **Payment Method** — Credit Card, Check, or Outgoing Wire Transfer (REF-060)
   - **Bank Account** — pre-filled or empty per REF-070 resolution logic
   - **Reason** — optional (REF-040)
4. User clicks "Confirm Refund".
5. A Confirmation Dialog appears, summarizing the financial impact:
   - **Source**: [Patient Name] ([Original Amount]) → Status: `Overpaid`.
   - **Refund**: New record of -[Original Amount] on [Repayment Date].
   - **Accounting**: "This will create a negative bank transfer and fund payment group."
6. Upon user confirmation, the refund process is initiated.
7. After success, the source procedure's status badge updates to `Overpaid`.

### User Flow — Cancel Refund

1. User opens the `EditProcedureModal` for an `Overpaid` or `OverpaymentRefund` procedure and clicks "Cancel Refund".
2. A Confirmation Dialog appears: "This will permanently cancel the refund and revert the source procedure to its previous status."
3. Upon user confirmation, the cancellation cascade is initiated (REF-210).
4. After success, the source procedure's status badge reverts to `FundPayed` or `PartiallyFundPayed`.

---

## Open Questions

None — all questions have been resolved.

---

## Future Improvements — Partial Overpayments (Out of Scope for V1)

While the current version (V1) supports only full refunds (REF-020), the system should eventually allow partial overpayment management. The items below are **not numbered** and must not be implemented until a V2 spec is produced.

### Proposed Changes

**Partial Refund Support**: The user will be able to input a specific `refund_amount`. The amount must be greater than 0 and less than or equal to `source.procedure_amount`.

**Partial Refund Status Logic**:
- If `refund_amount == source.procedure_amount`: Status = `Overpaid`.
- If `refund_amount < source.procedure_amount`: Status = `PartiallyOverpaid`.

**Multiple Refunds**: A single `source_procedure` could have multiple `ProcedureRefund` entries. Validation: the sum of all `refund_amount` for a single source must not exceed `source.procedure_amount`.
