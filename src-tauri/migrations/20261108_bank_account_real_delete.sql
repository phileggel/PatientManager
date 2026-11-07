-- A deleted bank account is really deleted (#584, ADR-009, step 2 of #579), so its
-- IBAN and name can be used again. Labels of a deleted account were already deleted
-- (BAS-046); any left go first. A flagged account still holding a bank entry is kept,
-- so no entry is left dangling: 20261024 restored every such account and BAC-043
-- refuses new ones, and the real database held none (#579, step 0).
-- Order: the triggers and indexes naming the flag go first, or SQLite refuses to drop
-- the column; the uniqueness the IBAN triggers kept becomes a full unique index.
-- IRREVERSIBLE: the flagged accounts are lost; a kept one loses a clashing name
-- (renamed, BAC-061) or IBAN (cleared, BAC-062).

DROP TRIGGER trg_bank_account_delete_labels;
DROP TRIGGER trg_bank_account_iban_unique_insert;
DROP TRIGGER trg_bank_account_iban_unique_update;
DROP INDEX idx_bank_account_name_active;
DROP INDEX idx_bank_account_iban_active;

DELETE FROM bank_fund_label_mapping
WHERE bank_account_id IN (SELECT id FROM bank_account WHERE is_deleted = 1);

DELETE FROM bank_account
WHERE is_deleted = 1
  AND id NOT IN (SELECT bank_account_id FROM bank_transfer);

-- A kept account becomes a live one when the flag goes (BAC-060): a name or an IBAN
-- another account uses is suffixed or cleared first (BAC-061, BAC-062), so the
-- unique indexes below can be built.
UPDATE bank_account
SET name = name || ' (restauré ' || substr(id, 1, 8) || ')'
WHERE is_deleted = 1
  AND EXISTS (SELECT 1 FROM bank_account AS other
              WHERE other.id <> bank_account.id AND other.name = bank_account.name);

UPDATE bank_account
SET iban = NULL
WHERE is_deleted = 1
  AND iban IS NOT NULL
  AND EXISTS (SELECT 1 FROM bank_account AS other
              WHERE other.id <> bank_account.id AND other.iban = bank_account.iban);

ALTER TABLE bank_account DROP COLUMN is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_account_name ON bank_account(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_account_iban ON bank_account(iban);

-- BAS-046: an account's labels go with it, before the row, so their foreign key holds.
CREATE TRIGGER IF NOT EXISTS trg_bank_account_delete_labels
BEFORE DELETE ON bank_account
BEGIN
    DELETE FROM bank_fund_label_mapping WHERE bank_account_id = OLD.id;
END;
