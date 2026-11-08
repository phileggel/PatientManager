-- Every account has a type (#518, owner 2026-11-07): `bank` for the user's real accounts,
-- `cash`, `check` and `card` for the technical accounts a direct payment of that type is
-- recorded on (BAC-050A). The user's accounts become `bank`; the cash account becomes the
-- `cash` account, its stored name a marker never shown; the `check` and `card` accounts are
-- created. Name uniqueness covers the `bank` accounts only (BAC-013), so the unique index
-- becomes partial, dropped before the cash account takes the name `cash`. Entry types are
-- stored as `CASH`, `CHECK`, `CREDIT_CARD` (bank_entry.rs, transfer_type_to_str).
-- IRREVERSIBLE: every patient's cash, check and card payment moves to its technical
-- account; the account it was recorded on is lost. A refund paid by check or card is a
-- negative entry (REF-110) and stays on its `bank` account (BAC-058).

-- BAC-064 (owner, 2026-11-08): the upgrade is refused while an entry that is not a patient's
-- direct payment — a fund wire, a refund — sits on the cash account (possible before #455):
-- the CHECK fails on the first such row and the whole migration rolls back.
CREATE TEMP TABLE IF NOT EXISTS upgrade_refused_entry_on_the_cash_account (
    a_fund_wire_or_refund_is_on_the_cash_account INTEGER
        CHECK (a_fund_wire_or_refund_is_on_the_cash_account = 0)
);
INSERT INTO upgrade_refused_entry_on_the_cash_account (a_fund_wire_or_refund_is_on_the_cash_account)
    SELECT 1 FROM bank_transfer
    WHERE bank_account_id = 'cash-account-default'
      AND NOT (transfer_type IN ('CASH', 'CHECK', 'CREDIT_CARD') AND amount > 0);
DROP TABLE upgrade_refused_entry_on_the_cash_account;

ALTER TABLE bank_account ADD COLUMN account_type TEXT NOT NULL DEFAULT 'bank'
    CHECK (account_type IN ('bank', 'cash', 'check', 'card'));

DROP INDEX IF EXISTS idx_bank_account_name;

UPDATE bank_account SET account_type = 'cash', name = 'cash', iban = NULL
WHERE id = 'cash-account-default';

INSERT INTO bank_account (id, name, iban, account_type)
VALUES ('cash-account-default', 'cash', NULL, 'cash'),
       ('check-account-default', 'check', NULL, 'check'),
       ('card-account-default', 'card', NULL, 'card')
ON CONFLICT(id) DO NOTHING;

UPDATE bank_transfer SET bank_account_id = 'cash-account-default'
WHERE transfer_type = 'CASH' AND amount > 0;
UPDATE bank_transfer SET bank_account_id = 'check-account-default'
WHERE transfer_type = 'CHECK' AND amount > 0;
UPDATE bank_transfer SET bank_account_id = 'card-account-default'
WHERE transfer_type = 'CREDIT_CARD' AND amount > 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_account_name ON bank_account(name)
WHERE account_type = 'bank';
