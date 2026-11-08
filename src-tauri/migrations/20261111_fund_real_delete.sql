-- A deleted fund is really deleted (#590, ADR-009, step 7 of #579). A flagged fund a
-- procedure or a fund payment group still uses is kept and becomes a live fund once
-- the flag is dropped (PRO-295); the real database held none (#579, step 0).
-- The bank statement labels are a support table: their foreign key to the fund goes
-- (owner, 2026-11-08), so a fund's deletion leaves them and the reads skip a label
-- whose fund is gone (BAS-041D). SQLite cannot drop a constraint, so the table is
-- rebuilt; the account trigger naming it is dropped first and created again after.
-- Order: the index naming the flag goes first, or SQLite refuses to drop the column;
-- a kept fund whose identifier another fund uses is suffixed (PRO-295), so the full
-- unique index can be built.
-- IRREVERSIBLE: the flagged funds are lost; their labels stay, unknown (BAS-041D); a
-- kept fund may lose its identifier as it was.

DROP TRIGGER trg_bank_account_delete_labels;

CREATE TABLE IF NOT EXISTS bank_fund_label_mapping_rebuilt (
    id               TEXT    PRIMARY KEY NOT NULL,
    bank_account_id  TEXT    NOT NULL,
    bank_label       TEXT    NOT NULL,
    fund_id          TEXT,
    FOREIGN KEY (bank_account_id) REFERENCES bank_account(id)
);

INSERT INTO bank_fund_label_mapping_rebuilt (id, bank_account_id, bank_label, fund_id)
SELECT id, bank_account_id, bank_label, fund_id FROM bank_fund_label_mapping;

DROP TABLE bank_fund_label_mapping;

ALTER TABLE bank_fund_label_mapping_rebuilt RENAME TO bank_fund_label_mapping;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_fund_label
    ON bank_fund_label_mapping(bank_account_id, bank_label);

-- BAS-046: an account's labels go with it, before the row, so their foreign key holds.
CREATE TRIGGER IF NOT EXISTS trg_bank_account_delete_labels
BEFORE DELETE ON bank_account
BEGIN
    DELETE FROM bank_fund_label_mapping WHERE bank_account_id = OLD.id;
END;

DROP INDEX idx_fund_identifier_active;

DROP TABLE IF EXISTS removed_fund;
CREATE TEMP TABLE IF NOT EXISTS removed_fund AS
SELECT id FROM fund
WHERE is_deleted = 1
  AND id NOT IN (SELECT fund_id FROM procedure WHERE fund_id IS NOT NULL)
  AND id NOT IN (SELECT fund_id FROM fund_payment_group);

UPDATE patient SET latest_fund = NULL
WHERE latest_fund IN (SELECT id FROM removed_fund);

DELETE FROM fund WHERE id IN (SELECT id FROM removed_fund);

DROP TABLE removed_fund;

UPDATE fund
SET fund_identifier = fund_identifier || ' (restauré ' || substr(id, 1, 8) || ')'
WHERE is_deleted = 1
  AND EXISTS (SELECT 1 FROM fund AS other
              WHERE other.id <> fund.id AND other.fund_identifier = fund.fund_identifier);

ALTER TABLE fund DROP COLUMN is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_identifier ON fund(fund_identifier);
