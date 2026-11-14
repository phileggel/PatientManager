# Business Rules — Overpayment Management (REF)

## Context

An overpayment ("indu") occurs when a fund (insurance body) has paid for an act that was not due, or paid too much, and requests a refund weeks or months later. This feature allows the practitioner to manually select a previously paid procedure, record the refund request, and track the actual repayment.

Recording an overpayment creates a "mirror" negative record across the entire chain (Procedure → Fund Payment → Bank Transfer) to maintain accounting consistency.

---

## Entity Definition

### ProcedureRefund

Represents the link between the original paid procedure and the refund procedure created to offset it.

**Context placement**: `use_cases/overpayment/` orchestrator; repository owned by `context/procedure/`.

| Field                          | Business meaning                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source_procedure_id`          | The original procedure that was overpaid.                                                                                                                             |
| `refund_procedure_id`          | The new procedure created with a negative amount to represent the refund.                                                                                             |
| `refund_date`                  | The date the refund was recorded/paid.                                                                                                                                |
| `reason`                       | Optional text explaining why the refund was requested (max 255 chars).                                                                                                |
| `refund_fund_payment_group_id` | The refund fund payment group (REF-100).                                                                                                                              |
| `refund_bank_transfer_id`      | The refund bank entry (REF-110).                                                                                                                                      |
| `previous_payment_status`      | The source procedure's payment status before it became `Overpaid` (`FundPaid` or `PartiallyFundPaid`). Used by REF-210 to revert the source to its exact prior state. |

---

## Business Rules

### Eligibility and Initiation

**REF-010 — Refund Eligibility (backend)**: Only procedures with a final payment status (`FundPaid`, `PartiallyFundPaid`) are eligible for a refund. A source in any other status, or an unknown one, is refused with a specific error.

**REF-011 — The source has a fund (backend)**: A source procedure with no fund is refused with a specific error (today checked after the refund procedure is written: ADR-002 until #390).

**REF-020 — Full Refund Only (backend)**: An overpayment always covers the full amount of the original procedure. Partial refunds are not supported in V1. The backend rejects any request where the submitted amount differs from `source.procedure_amount`, returning a validation error.

**REF-030 — Refund Date Validation (backend)**: The `refund_date` must be a valid date, not in the future, and cannot be earlier than the `confirmed_payment_date` of the source procedure. "The future" is judged against today's local date. Any other date is refused with a specific error.

**REF-040 — Reason Field Validation (backend)**: The `reason` field is optional, but if provided, it must not exceed 255 characters, counted in Unicode code points: one code point is one character, so a precomposed accented letter is one and a composed emoji or a decomposed letter is several. A longer reason is refused with a specific error.

### Creation of Refund Records

**REF-050 — Atomic Refund Creation (backend)**: Creating an overpayment is a single database transaction. If any step fails, the entire operation rolls back and no record is persisted. Not so yet: the code follows ADR-002 until #390 ships (owner, 2026-10-24).

**REF-060 — Refund Payment Method Validation (backend)**: A refund names its payment method. Accepted values are `CreditCard`, `Check`, and `OutgoingWire`. `Cash` and `Fund` are not accepted for refunds: `Fund` is an incoming payment type and `Cash` cannot be remitted to an insurance body. The backend rejects any other value with a validation error.

**REF-070 — Bank Account (backend)**: The refund bank transfer must be linked to a `bank` account; a technical one is refused as unknown (BAC-055A), and a refund that names no account is refused. With no `bank` account in the system, no refund can be recorded.

**REF-075 — The source's bank account (backend)**: The source's bank account is the account of its original bank entry when that is a `bank` account (BAC-055); a direct payment's technical account, an unknown source or a source with no bank entry has none.

**REF-080 — OutgoingWire Transfer Type Exclusivity (backend)**: The `OutgoingWire` variant of `TransferType` is only creatable through the overpayment flow. The bank statement manual-match command rejects any attempt to create a bank transfer with `transfer_type = OutgoingWire`.

**REF-090 — Create Refund Procedure (backend)**: A new `Procedure` is created with:

- Same `patient_id`, `fund_id`, and `procedure_type_id` as the source procedure.
- `procedure_amount` = `-source.procedure_amount`.
- `payment_status` = `OverpaymentRefund` (direct assignment, no lifecycle transition).
- `procedure_date` = `refund_date`.
- `payment_method` = mapped from the user-selected transfer type (REF-060): `CreditCard → BankCard`, `Check → Check`, `OutgoingWire → BankTransfer`. This field must be populated so that the refund procedure appears correctly in the procedure list payment method column.
- `confirmed_payment_date` = `refund_date`. The refund is considered executed on that date.
- `actual_payment_amount` = `-source.procedure_amount`. Consistent with the negative `procedure_amount`.

**REF-100 — Create Refund Fund Payment Group (backend)**: A new `FundPaymentGroup` is created containing only the refund procedure, with:

- `fund_id` from the source procedure.
- `total_amount` = `-source.procedure_amount`.
- `payment_date` = `refund_date`.
- `status` = `BankPaid` (direct assignment, bypasses normal reconciliation flow intentionally).
- `is_locked` = `true`.
- One `FundPaymentLine` entry linking the refund procedure (REF-090) to this group, consistent with the invariant that all `FundPaymentGroup` records contain at least one line.

**REF-110 — Create Refund Bank Transfer (backend)**: A new `BankTransfer` is created linked to the refund `FundPaymentGroup` (REF-100), with:

- `amount` = `-source.procedure_amount`.
- `transfer_date` = `refund_date`.
- `transfer_type` = the payment method selected by the user (REF-060).
- `bank_account_id` = the bank account selected by the user (REF-070).

**REF-120 — Bank Transfer Link Creation (backend)**: A `BankTransferLink` record is created linking the refund bank transfer (REF-110) to the refund fund payment group (REF-100), maintaining the junction table invariant that all `BankPaid` groups have a corresponding link entry.

**REF-130 — Refund Link (backend)**: Every overpayment must be recorded in the `ProcedureRefund` table, linking the source procedure to the refund procedure, storing the provided reason, and storing the source procedure's current `payment_status` as `previous_payment_status` at the moment of creation.

**REF-140 — ProcedureRefund Immutability (backend)**: Once created, a `ProcedureRefund` record is immutable. Its `reason`, `refund_date`, and linked procedure IDs cannot be updated. Modifications must go through cancellation (REF-210) and re-creation.

**REF-150 — ProcedureRefund Repository Ownership (backend)**: The `ProcedureRefund` entity's repository trait, SQLite implementation, and migration are owned by `context/procedure/`. The `use_cases/overpayment/` orchestrator depends on this repository through the standard `Arc<dyn ProcedureRefundRepository>` injection pattern.

### Status Transitions

**REF-160 — Source Procedure Status Update (backend)**: Upon successful completion of the atomic refund creation (REF-050), the source procedure's `payment_status` changes to `Overpaid`.

**REF-170 — Refund Procedure Type Propagation (backend)**: If the `procedure_type_id` of an `Overpaid` source procedure is updated, the linked `OverpaymentRefund` procedure's `procedure_type_id` is updated to match in the same operation. This logic is implemented by augmenting the existing `update_procedure` Tauri command in `use_cases/procedure_orchestration/`: the orchestrator checks whether the updated procedure has `Overpaid` status; if so, it queries `ProcedureRefund` by `source_procedure_id` to locate the linked refund procedure and applies the same `procedure_type_id` update atomically. For all other statuses, the orchestrator skips this step.

### Edit

**REF-200 — A refund procedure is not edited (backend)**: An edit of a procedure in `OverpaymentRefund` status is refused with a specific error, and nothing is saved; REF-170's propagation from its source aside.

### Deletion

**REF-210 — Cancellation of Overpayment (backend)**: Cancelling a refund is a single database transaction, executed in reverse creation order (not yet a transaction: ADR-002 until #390, owner, 2026-10-24). A cancellation names the overpaid source procedure; from the refund procedure, its refund record (REF-130) gives the source. With no overpayment for the source, it is refused with a specific error. The refund record gives every related record:

1. Revert the source procedure's `payment_status` to the value stored in `ProcedureRefund.previous_payment_status`.
2. Delete the `ProcedureRefund` link entry.
3. Delete the `BankTransferLink` entry.
4. Delete the refund bank transfer.
5. Delete the refund fund payment group and its lines.
6. Delete the refund procedure.

If any step fails, the entire operation rolls back.

**REF-220 — Deletion of Overpaid Source Procedure (backend)**: A source procedure with `Overpaid` status cannot be deleted directly. Its linked overpayment must be cancelled first (REF-210).

**REF-230 — Deletion of Refund Procedure (backend)**: A refund procedure with `OverpaymentRefund` status cannot be deleted directly. Only the refund's cancellation (REF-210) removes it.

**REF-240 — Refund Fund Payment Group Deletion Guard (backend)**: The refund `FundPaymentGroup` (created by REF-100) cannot be deleted directly via `delete_fund_payment_group`. It can only be removed as part of the REF-210 cancellation cascade. The backend rejects any direct deletion attempt with an explicit error.

---

## Workflow

```text
[User selects a paid procedure]
  → Checks eligibility (REF-010)
          │
          ▼
[User enters refund details]
  → Refund date (REF-030)
  → Payment method (REF-060)
  → Bank account (REF-070)
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
  → Names the source procedure (REF-210)
  → Revert source status (from ProcedureRefund.previous_payment_status)
  → Delete ProcedureRefund link
  → Delete BankTransferLink
  → Delete refund bank transfer
  → Delete refund fund payment group and its lines
  → Delete refund procedure
```

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
