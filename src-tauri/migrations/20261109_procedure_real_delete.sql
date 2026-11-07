-- A deleted procedure is really deleted (#588, ADR-009, step 5 of #579), as the Excel
-- import already deletes them. A flagged procedure still referred to by a payment
-- line, a bank link or a refund record (either side) is kept, so no row is left
-- dangling, and becomes a live procedure once the flag is dropped (PRO-031); the real
-- database held none (#579, step 0). The index naming the flag goes first, or SQLite
-- refuses to drop the column.
-- IRREVERSIBLE: the flagged procedures are lost.

DROP INDEX idx_procedure_deleted;

DELETE FROM procedure
WHERE is_deleted = 1
  AND id NOT IN (SELECT procedure_id FROM fund_payment_line)
  AND id NOT IN (SELECT procedure_id FROM bank_transfer_procedure_link)
  AND id NOT IN (SELECT source_procedure_id FROM procedure_refund)
  AND id NOT IN (SELECT refund_procedure_id FROM procedure_refund);

ALTER TABLE procedure DROP COLUMN is_deleted;
