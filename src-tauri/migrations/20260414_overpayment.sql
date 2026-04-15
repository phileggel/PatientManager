-- Migration: Overpayment Management (REF)
--
-- ProcedureStatus: adds "OVERPAID" and "OVERPAYMENT_REFUND" variants.
--   Stored as TEXT in `procedure.payment_status` — no schema change needed;
--   new variants serialize via SCREAMING_SNAKE_CASE serde automatically.
--
-- BankTransferType: adds "OUTGOING_WIRE" variant.
--   Stored as TEXT in `bank_transfer.transfer_type` — no schema change needed.
--
-- New table: procedure_refund
--   Links a source procedure (Overpaid) to its mirror refund procedure (OverpaymentRefund).
--   Stores the IDs of all created records for the cancellation cascade (REF-210).

CREATE TABLE IF NOT EXISTS procedure_refund (
    id                              TEXT PRIMARY KEY NOT NULL,
    source_procedure_id             TEXT NOT NULL REFERENCES procedure(id),
    refund_procedure_id             TEXT NOT NULL REFERENCES procedure(id),
    refund_fund_payment_group_id    TEXT NOT NULL REFERENCES fund_payment_group(id),
    refund_bank_transfer_id         TEXT NOT NULL REFERENCES bank_transfer(id),
    refund_date                     TEXT NOT NULL,
    reason                          TEXT,
    previous_payment_status         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_procedure_refund_source
    ON procedure_refund(source_procedure_id);

CREATE INDEX IF NOT EXISTS idx_procedure_refund_group
    ON procedure_refund(refund_fund_payment_group_id);
