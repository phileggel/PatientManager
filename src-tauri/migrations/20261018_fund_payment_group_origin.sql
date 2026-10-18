-- REF-240 (#355): a fund payment group records where it comes from, once, at
-- creation: `PAYMENT` — money a fund paid (manual entry, a fund statement, a
-- bank statement); `REFUND` — the group a refund to a patient creates (REF-100),
-- which only the refund's cancellation (REF-210) removes.
--
-- Backfill: a refund group is the one `procedure_refund` points to; every
-- other group is a payment. Exact for every group a `procedure_refund` points
-- to. A cancelled refund's group (REF-210) lost its pointer and was
-- soft-deleted: it stays `PAYMENT`, and no read of `origin` loads a
-- soft-deleted group. A cancellation that failed after removing the pointer
-- (no transaction, ADR-002, ticket #390) leaves a live refund group read as
-- `PAYMENT`; nothing in the data tells it apart.

ALTER TABLE fund_payment_group
    ADD COLUMN origin TEXT NOT NULL DEFAULT 'PAYMENT'
    CHECK (origin IN ('PAYMENT', 'REFUND'));

UPDATE fund_payment_group
SET origin = 'REFUND'
WHERE id IN (SELECT refund_fund_payment_group_id FROM procedure_refund);
