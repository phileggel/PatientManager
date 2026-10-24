-- Ticket #448 (bank-account R6–R9): an account a bank entry is recorded on
-- is never deleted (R6). Before R6 refused it, an installed database could
-- soft-delete one, and its entries then read as not found. This brings each such
-- account back (R7). A bank entry is hard-deleted, so every `bank_transfer` row
-- counts. Its bank statement labels stay deleted (BAS-046): nothing tells the
-- ones the deletion removed from the ones the user removed.
--
-- A restored account must keep names unique among active accounts and IBANs
-- unique among all of them (R5, R8, R9, owner, 2026-10-24): a name an active account
-- uses is suffixed with the start of its id, which keeps two restored namesakes
-- apart too; an IBAN another account uses, deleted or not, is cleared, so an
-- active holder keeps resolving statements (BAS-010). The IBAN triggers of
-- 20260928 do not fire on a cleared IBAN. Idempotent: a restored
-- account is no longer deleted, so a second run changes nothing.
--
-- IRREVERSIBLE: restores accounts, renames namesakes and clears clashing IBANs;
-- the restored set is not kept.

DROP TABLE IF EXISTS restored_bank_account;

CREATE TEMP TABLE restored_bank_account AS
SELECT id, name, iban FROM bank_account
WHERE is_deleted = 1
    AND id IN (SELECT bank_account_id FROM bank_transfer);

UPDATE bank_account
SET name = name || ' (restauré ' || substr(id, 1, 8) || ')'
WHERE id IN (SELECT id FROM restored_bank_account)
    AND (
        EXISTS (
            SELECT 1 FROM bank_account AS active
            WHERE active.is_deleted = 0 AND active.name = bank_account.name
        )
        OR (SELECT COUNT(*) FROM restored_bank_account AS r
            WHERE r.name = bank_account.name) > 1
    );

UPDATE bank_account
SET iban = NULL
WHERE id IN (SELECT id FROM restored_bank_account)
    AND iban IS NOT NULL
    AND (
        EXISTS (
            SELECT 1 FROM bank_account AS other
            WHERE other.id <> bank_account.id AND other.iban = bank_account.iban
                AND other.id NOT IN (SELECT id FROM restored_bank_account)
        )
        OR (SELECT COUNT(*) FROM restored_bank_account AS r
            WHERE r.iban = bank_account.iban) > 1
    );

UPDATE bank_account
SET is_deleted = 0
WHERE id IN (SELECT id FROM restored_bank_account);

DROP TABLE restored_bank_account;
