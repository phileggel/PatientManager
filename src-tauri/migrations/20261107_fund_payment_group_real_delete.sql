-- A deleted fund payment group is really deleted (#586, ADR-009, step 4 of #579): its
-- lines are already gone (#585), and its foreign key would stop its fund being deleted.
-- A flagged group still referred to by a line, a bank link or a refund record is kept,
-- so no row is left dangling, and becomes a live group once the flag is dropped
-- (FPM-401); the real database held none (#579, step 0). The index
-- naming the flag goes first, or SQLite refuses to drop the column.
-- IRREVERSIBLE: the flagged groups are lost.

DROP INDEX idx_fund_payment_group_deleted;

DELETE FROM fund_payment_group
WHERE is_deleted = 1
  AND id NOT IN (SELECT fund_payment_group_id FROM fund_payment_line)
  AND id NOT IN (SELECT fund_payment_group_id FROM bank_transfer_fund_group_link)
  AND id NOT IN (SELECT refund_fund_payment_group_id FROM procedure_refund);

ALTER TABLE fund_payment_group DROP COLUMN is_deleted;
