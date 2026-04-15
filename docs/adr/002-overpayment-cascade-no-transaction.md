# ADR 002 — Accept Partial-State Risk in the Overpayment Cascade (No DB Transaction)

**Date**: 2026-04-15
**Status**: Accepted

## Context

The overpayment creation flow (`create_overpayment`, REF-050) performs up to 12 sequential
SQLite writes across three bounded contexts:

1. Create refund `Procedure` (OverpaymentRefund status)
2. Create refund `FundPaymentGroup` (BankPayed, negative amount)
3. Create refund `BankTransfer` (OutgoingWire, negative amount)
4. Create `BankTransferLink` (group ↔ transfer)
5. Create `ProcedureRefund` (the linking record)
6. Update source `Procedure` status → Overpaid

The symmetric cancellation flow (`cancel_overpayment`, REF-210) reverses these in order.

If any step fails mid-cascade, the writes already committed remain in the database — there is no
automatic rollback. The same limitation applies to all other multi-step orchestrators in this
codebase (`excel_import`, `bank_manual_match`, `fund_payment_reconciliation`), which were built
without explicit transaction management for the same reasons.

Wrapping the cascade in a single `sqlx` transaction (`BEGIN` … `COMMIT` / `ROLLBACK`) was
considered. It would guarantee atomicity but adds meaningful complexity: the entire cascade must
share a single `sqlx::Transaction<'_, Sqlite>` reference, which cannot be passed through the
existing `Arc<dyn Repository>` trait boundaries without either changing the trait signatures
(breaking all existing repository implementations) or introducing a second layer of per-operation
transaction handles.

## Decision

Accept the partial-state risk and do **not** wrap the overpayment cascade in a database
transaction. The motivations are:

1. **Codebase consistency** — no existing orchestrator uses explicit transactions; introducing one
   here would be an isolated pattern with no shared infrastructure to support it.

2. **Partial state is detectable and recoverable** — the `ProcedureRefund` record is written last
   (step 5). If the cascade fails before step 5, the source procedure retains its original status
   and no `ProcedureRefund` link exists. Support can detect the orphaned records by querying
   procedures with `OverpaymentRefund` status that have no corresponding `ProcedureRefund` row.
   The `cancel_overpayment` cascade provides a compensating path once the issue is identified.

3. **Failure probability is low** — all writes target the same local SQLite file. The failure
   modes that would cause a mid-cascade abort (disk full, process kill) are rare in a desktop
   application context and would likely also affect the database file itself.

4. **V1 scope** — the feature is scoped to single-user desktop use. A distributed transaction
   manager or saga pattern is disproportionate for this use case.

## Consequences

- **Pro**: Repository trait signatures remain unchanged; no rework of existing implementations.
- **Pro**: Consistent with the established orchestration pattern across the codebase.
- **Pro**: `cancel_overpayment` serves as a manual compensating transaction for the happy path.
- **Con**: A mid-cascade failure (e.g. process killed between steps 3 and 5) can leave orphaned
  `BankTransfer` or `FundPaymentGroup` records in a `BankPayed` state with no `ProcedureRefund`
  linking record. Recovery requires manual DB inspection or a future admin cleanup tool.
- **Con**: The source procedure may remain in `FundPayed` / `PartiallyFundPayed` status even
  though partial refund records were written, until the orphaned records are cleaned up.
- **Note**: If transaction support becomes a cross-cutting requirement in a future version,
  the recommended approach is to pass `sqlx::Transaction` as a parameter through the service
  layer (unit-of-work pattern) rather than through `Arc<dyn Repository>` traits.
