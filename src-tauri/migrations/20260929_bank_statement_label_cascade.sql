-- BAS-046: deleting a bank account deletes its bank statement labels
-- (bank_fund_label_mapping). Bank accounts are never restored.
--
-- A trigger rather than a call from the bank context: the labels belong to the
-- bank-statement reconciliation use case (ADR-001), which the bank context must
-- not import. The backfill deletes, once, the labels of accounts deleted before
-- this migration; both statements run in SQLx's migration transaction.

CREATE TRIGGER IF NOT EXISTS trg_bank_account_delete_labels
AFTER UPDATE OF is_deleted ON bank_account
WHEN NEW.is_deleted = 1 AND OLD.is_deleted = 0
BEGIN
    UPDATE bank_fund_label_mapping
    SET is_deleted = 1
    WHERE bank_account_id = NEW.id AND is_deleted = 0;
END;

-- IRREVERSIBLE: labels of deleted accounts are soft-deleted for good (accounts are never restored).
UPDATE bank_fund_label_mapping
SET is_deleted = 1
WHERE is_deleted = 0
    AND bank_account_id IN (SELECT id FROM bank_account WHERE is_deleted = 1);
