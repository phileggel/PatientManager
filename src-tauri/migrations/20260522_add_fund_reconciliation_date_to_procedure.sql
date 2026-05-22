-- Migration: Add `fund_reconciliation_date` to procedure
--
-- Splits the two payment-lifecycle dates that previously collided on
-- `confirmed_payment_date`:
--
--   * `fund_reconciliation_date` (NEW) — Stage 1, the fund-document
--     declared payment date. Set by fund-payment-* reconciliation flows
--     when the procedure enters a FundPaymentGroup (PRO-250, FPM-320,
--     FPA-300); cleared on removal (FPM-310, FPM-400).
--
--   * `confirmed_payment_date` (RETAINED, narrowed) — Stage 2, the
--     bank-side confirmed payment date. Set by bank-statement-* flows
--     when the procedure's group is matched to a bank transfer, or
--     directly at Excel import (column J) for procedures arriving
--     with payment data already present.
--
-- Backfill strategy:
--   * Every procedure currently in a FundPaymentGroup gets
--     `fund_reconciliation_date` populated from the group's
--     `payment_date` (the canonical Stage 1 date).
--   * Procedures that reached Stage 2 (group has a
--     bank_transfer_fund_group_link) keep their existing
--     `confirmed_payment_date` (= bank transfer date).
--   * Procedures only at Stage 1 (group has NO bank link) had
--     `confirmed_payment_date` wrongly storing the group's
--     payment_date — the field is cleared to NULL so the new column
--     becomes the single source of truth for Stage 1.
--   * Procedures not in any group (Created, ImportDirectlyPayed,
--     ImportFundPayed, OverpaymentRefund stored elsewhere) are
--     untouched.

ALTER TABLE procedure
    ADD COLUMN fund_reconciliation_date TEXT;

-- Step 1 — populate fund_reconciliation_date for every procedure
-- currently linked to an active FundPaymentGroup.
UPDATE procedure
SET fund_reconciliation_date = (
    SELECT fpg.payment_date
    FROM fund_payment_line fpl
    JOIN fund_payment_group fpg ON fpg.id = fpl.fund_payment_group_id
    WHERE fpl.procedure_id = procedure.id
      AND fpl.is_deleted = 0
      AND fpg.is_deleted = 0
    LIMIT 1
)
WHERE procedure.is_deleted = 0
  AND EXISTS (
    SELECT 1
    FROM fund_payment_line fpl
    JOIN fund_payment_group fpg ON fpg.id = fpl.fund_payment_group_id
    WHERE fpl.procedure_id = procedure.id
      AND fpl.is_deleted = 0
      AND fpg.is_deleted = 0
  );

-- Step 2 — clear the stale confirmed_payment_date for Stage-1-only
-- procedures (in a group whose group has no bank link). Stage-2
-- procedures keep their bank-transfer date intact.
UPDATE procedure
SET confirmed_payment_date = NULL
WHERE procedure.is_deleted = 0
  AND EXISTS (
    SELECT 1
    FROM fund_payment_line fpl
    WHERE fpl.procedure_id = procedure.id
      AND fpl.is_deleted = 0
      AND fpl.fund_payment_group_id NOT IN (
        SELECT btfg.fund_payment_group_id
        FROM bank_transfer_fund_group_link btfg
      )
  );
