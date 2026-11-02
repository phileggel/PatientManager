-- A deleted bank statement label is really deleted (#583, ADR-009).
-- Nothing refers to a label, so every flagged row can go. Order: the trigger and the
-- index naming the flag first, or SQLite refuses to drop the column.
-- IRREVERSIBLE: flagged labels are gone; they reached no screen or query.

DROP TRIGGER trg_bank_account_delete_labels;
DROP INDEX idx_bank_fund_label_active;

DELETE FROM bank_fund_label_mapping WHERE is_deleted = 1;

ALTER TABLE bank_fund_label_mapping DROP COLUMN is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_fund_label
    ON bank_fund_label_mapping(bank_account_id, bank_label);

-- BAS-046: bank accounts are still soft-deleted, so this still fires on the flag.
CREATE TRIGGER IF NOT EXISTS trg_bank_account_delete_labels
AFTER UPDATE OF is_deleted ON bank_account
WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0
BEGIN
    DELETE FROM bank_fund_label_mapping WHERE bank_account_id = NEW.id;
END;
