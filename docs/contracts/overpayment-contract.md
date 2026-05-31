# Contract — Overpayment

> Domain: overpayment
> Last updated by: overpayment spec

## Commands

### `create_overpayment` — REF-050 to REF-160

Atomic transaction. Creates the full refund chain in sequence:

1. Refund `Procedure` with negative amount and `OverpaymentRefund` status (REF-090)
2. Refund `FundPaymentGroup` — `BankPayed`, locked (REF-100)
3. Refund `BankTransfer` — `OutgoingWire` or other (REF-110)
4. `BankTransferLink` entry (REF-120)
5. `ProcedureRefund` link (REF-130)
6. Source procedure status → `Overpaid` (REF-160)

Validates eligibility (REF-010), refund date (REF-030), reason length (REF-040), payment method (REF-060), and bank account presence (REF-070). If any step fails, all changes roll back. REF-020 (full-amount constraint) is structurally enforced: `CreateOverpaymentRequest` carries no client-submitted amount — the refund always equals `source.billed_amount`, making partial refunds impossible by construction.

- **Args:** `CreateOverpaymentRequest`
- **Returns:** `()`
- **Errors:** `SourceProcedureNotFound`, `SourceNotRefundable` (REF-010), `InvalidRefundDate` (REF-030), `ReasonTooLong` (REF-040), `TransferTypeRejected` (REF-060), `BankAccountRequired` (REF-070), `BankAccountNotFound` (REF-070), `SourceHasNoFund`

---

### `cancel_overpayment` — REF-210

Atomic transaction. Reversal cascade in order: revert source procedure status (from `ProcedureRefund.previous_payment_status`), delete `ProcedureRefund` link, delete `BankTransferLink`, delete refund bank transfer, delete refund fund-payment group, delete refund procedure. Always identified by `source_procedure_id`. If any step fails, all changes roll back.

- **Args:** `CancelOverpaymentRequest`
- **Returns:** `()`
- **Errors:** `RefundRecordNotFound`, `SourceProcedureNotFound`

---

### `get_procedure_refund_by_source` — REF-190, REF-210

Returns the `ProcedureRefundInfo` for a given source procedure ID. Used by the `Overpaid` modal to display the refund details and by the "Cancel Refund" action to resolve IDs before cancellation.

- **Args:** `source_procedure_id: String`
- **Returns:** `ProcedureRefundInfo` (optional — `null` if not found)
- **Errors:** —

---

### `get_procedure_refund_by_refund_procedure` — REF-200, REF-210

Returns the `ProcedureRefundInfo` for a given refund procedure ID. Used by the `OverpaymentRefund` modal to resolve the `source_procedure_id` before initiating cancellation (REF-210).

- **Args:** `refund_procedure_id: String`
- **Returns:** `ProcedureRefundInfo` (optional — `null` if not found)
- **Errors:** —

---

## Shared Types

```rust
// REF-050 — request to create a full overpayment refund
struct CreateOverpaymentRequest {
    source_procedure_id: String,
    refund_date: String,          // ISO date YYYY-MM-DD; validated per REF-030
    transfer_type: String,        // domain enum name: "CreditCard", "Check", or "OutgoingWire" (REF-060)
    bank_account_id: String,      // resolved per REF-070
    reason: Option<String>,       // max 255 chars (REF-040)
}

// REF-210 — request to cancel an overpayment; always by source_procedure_id
struct CancelOverpaymentRequest {
    source_procedure_id: String,
}

// REF-130, REF-140 — the immutable link record between source and refund procedure
struct ProcedureRefundInfo {
    id: String,
    source_procedure_id: String,
    refund_procedure_id: String,
    refund_date: String,                      // ISO date YYYY-MM-DD
    reason: Option<String>,
    previous_payment_status: ProcedureStatus, // used by REF-210 to revert the source
}
```

## Events

| Event              | Trigger                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `ProcedureUpdated` | After `create_overpayment` — source procedure moves to `Overpaid`; refund procedure created (REF-160, REF-090) |
| `ProcedureUpdated` | After `cancel_overpayment` — source procedure reverts; refund procedure deleted (REF-210)                      |

## Changelog

- 2026-05-31 — Reconcile error names with typed implementation: `ProcedureNotEligible`→`SourceNotRefundable`, `InvalidPaymentMethod`→`TransferTypeRejected`, `RefundNotFound`→`RefundRecordNotFound`; drop stale `PartialRefundNotSupported` (REF-020 structurally enforced); add `BankAccountRequired` and `SourceHasNoFund` variants.
- 2026-05-02 — Added by `overpayment` spec: create_overpayment, cancel_overpayment, get_procedure_refund_by_source, get_procedure_refund_by_refund_procedure
