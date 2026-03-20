-- ============================================================================
-- Migration: bank_manual_match
-- Adds group status, junction tables for bank transfer links,
-- migrates source field, seeds cash account, rebuilds bank_transfer table.
-- ============================================================================

-- 1. Add status column to fund_payment_group (default ACTIVE)
ALTER TABLE fund_payment_group ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE';

-- 2. Set BANK_PAYED for groups that already have bank-reconciled procedures
UPDATE fund_payment_group
SET status = 'BANK_PAYED'
WHERE EXISTS (
    SELECT 1 FROM fund_payment_line fpl
    JOIN "procedure" p ON fpl.procedure_id = p.id
    WHERE fpl.fund_payment_group_id = fund_payment_group.id
      AND fpl.is_deleted = 0
      AND p.is_deleted = 0
      AND p.payment_status IN ('FUND_PAYED', 'PARTIALLY_FUND_PAYED')
);

-- 3. Junction table: bank_transfer ↔ fund_payment_group (FUND transfers)
CREATE TABLE IF NOT EXISTS bank_transfer_fund_group_link (
    id                    TEXT PRIMARY KEY NOT NULL,
    bank_transfer_id      TEXT NOT NULL,
    fund_payment_group_id TEXT NOT NULL,
    FOREIGN KEY (bank_transfer_id)      REFERENCES bank_transfer(id),
    FOREIGN KEY (fund_payment_group_id) REFERENCES fund_payment_group(id)
);

CREATE INDEX IF NOT EXISTS idx_bt_fund_group_transfer
    ON bank_transfer_fund_group_link(bank_transfer_id);
CREATE INDEX IF NOT EXISTS idx_bt_fund_group_group
    ON bank_transfer_fund_group_link(fund_payment_group_id);

-- 4. Junction table: bank_transfer ↔ procedure (direct payment transfers)
CREATE TABLE IF NOT EXISTS bank_transfer_procedure_link (
    id               TEXT PRIMARY KEY NOT NULL,
    bank_transfer_id TEXT NOT NULL,
    procedure_id     TEXT NOT NULL,
    FOREIGN KEY (bank_transfer_id) REFERENCES bank_transfer(id),
    FOREIGN KEY (procedure_id)     REFERENCES "procedure"(id)
);

CREATE INDEX IF NOT EXISTS idx_bt_procedure_transfer
    ON bank_transfer_procedure_link(bank_transfer_id);
CREATE INDEX IF NOT EXISTS idx_bt_procedure_procedure
    ON bank_transfer_procedure_link(procedure_id);

-- 5. Migrate source → bank_transfer_fund_group_link
--    Only active FUND transfers with "fund_payment_group_" prefix
INSERT INTO bank_transfer_fund_group_link (id, bank_transfer_id, fund_payment_group_id)
SELECT
    lower(hex(randomblob(16))),
    bt.id,
    substr(bt.source, 20) -- "fund_payment_group_" = 19 chars, extract from position 20
FROM bank_transfer bt
WHERE bt.transfer_type = 'FUND'
  AND bt.is_deleted = 0;

-- 6. Hard-delete previously soft-deleted bank_transfer records
DELETE FROM bank_transfer WHERE is_deleted = 1;

-- 7. Seed default cash account (idempotent)
INSERT INTO bank_account (id, name, iban, is_deleted)
VALUES ('cash-account-default', 'Caisse', NULL, 0)
ON CONFLICT(id) DO NOTHING;

-- 8. Recreate bank_transfer without source and is_deleted columns
--    (SQLite does not support DROP COLUMN on older versions — use recreate pattern)
CREATE TABLE bank_transfer_v2 (
    id              TEXT    PRIMARY KEY NOT NULL,
    transfer_date   TEXT    NOT NULL,
    amount          INTEGER NOT NULL,
    transfer_type   TEXT    NOT NULL,
    bank_account_id TEXT    NOT NULL,
    FOREIGN KEY (bank_account_id) REFERENCES bank_account(id)
);

INSERT INTO bank_transfer_v2 (id, transfer_date, amount, transfer_type, bank_account_id)
SELECT id, transfer_date, amount, transfer_type, bank_account_id
FROM bank_transfer;

DROP TABLE bank_transfer;
ALTER TABLE bank_transfer_v2 RENAME TO bank_transfer;

-- 9. Recreate indexes on bank_transfer
CREATE INDEX idx_bank_transfer_date    ON bank_transfer(transfer_date);
CREATE INDEX idx_bank_transfer_type    ON bank_transfer(transfer_type);
CREATE INDEX idx_bank_transfer_account ON bank_transfer(bank_account_id);
