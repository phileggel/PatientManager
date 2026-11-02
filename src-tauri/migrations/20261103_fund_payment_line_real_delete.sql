-- A deleted fund payment line is really deleted (#585, ADR-009): its flagged rows keep
-- a foreign key to a live procedure, which refuses the month purge of EXI-170.
-- Nothing refers to a line. The index naming the flag goes first, or SQLite refuses
-- to drop the column.
-- IRREVERSIBLE: the record of which procedures a deleted group held is lost
-- (owner, 2026-11-01).

DROP INDEX idx_fund_payment_line_deleted;

DELETE FROM fund_payment_line WHERE is_deleted = 1;

ALTER TABLE fund_payment_line DROP COLUMN is_deleted;
