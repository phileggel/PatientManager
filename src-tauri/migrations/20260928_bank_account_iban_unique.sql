-- bank-account R5 at the database level: no two accounts share an IBAN, active or
-- soft-deleted. The partial index idx_bank_account_iban_active covers active rows only.
--
-- Triggers rather than a full unique index: a database written before R5 may already
-- hold the same IBAN on soft-deleted rows, and a unique index would fail this migration
-- on it. The triggers refuse every new duplicate and leave legacy rows as they are; the
-- update trigger fires only when the IBAN actually changes, so editing a legacy row's
-- name still works.

CREATE TRIGGER IF NOT EXISTS trg_bank_account_iban_unique_insert
BEFORE INSERT ON bank_account
WHEN NEW.iban IS NOT NULL
    AND EXISTS (SELECT 1 FROM bank_account WHERE iban = NEW.iban)
BEGIN
    SELECT RAISE(ABORT, 'bank_account.iban must be unique');
END;

CREATE TRIGGER IF NOT EXISTS trg_bank_account_iban_unique_update
BEFORE UPDATE OF iban ON bank_account
WHEN NEW.iban IS NOT NULL
    AND NEW.iban IS NOT OLD.iban
    AND EXISTS (SELECT 1 FROM bank_account WHERE iban = NEW.iban AND id <> NEW.id)
BEGIN
    SELECT RAISE(ABORT, 'bank_account.iban must be unique');
END;
