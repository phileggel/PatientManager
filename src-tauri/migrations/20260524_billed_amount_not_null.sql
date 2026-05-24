-- Migration: Make procedure.billed_amount NOT NULL
--
-- Spec PRO-120 makes `billed_amount` a mandatory domain field; PRO-025
-- specifies that when no value is propagated from the patient's history or
-- the procedure type's default, the form submits `0`. The schema must
-- enforce the invariant so the column type can be tightened from
-- `Option<i64>` to `i64` end-to-end.
--
-- Backfill strategy for legacy NULL rows:
--   - Resolve the procedure's `procedure_type_id` and use that type's
--     `default_amount` (the value the FE has been displaying via the
--     `effectiveAmount` fallback). Lossless: the user-visible amount is
--     preserved.
--   - If the lookup yields NULL (orphan FK, defensive only — schema FK
--     should prevent it), fall back to `0`.
--
-- SQLite cannot add NOT NULL via ALTER, so the table is rebuilt. FK checks
-- are deferred to the transaction commit so DROP/RENAME does not violate
-- referencing tables (fund_payment_line, procedure_refund,
-- bank_transfer_procedure_link). The referenced IDs are preserved across
-- the rebuild, so the deferred check passes.

PRAGMA defer_foreign_keys = ON;

-- Step 1 — backfill NULL amounts from the procedure type's default_amount.
UPDATE procedure
SET billed_amount = COALESCE(
    billed_amount,
    (SELECT default_amount FROM procedure_type WHERE id = procedure.procedure_type_id),
    0
)
WHERE billed_amount IS NULL;

-- Step 2 — rebuild table with NOT NULL on billed_amount.
CREATE TABLE procedure_new (
    id                       TEXT    PRIMARY KEY NOT NULL,
    patient_id               TEXT    NOT NULL,
    fund_id                  TEXT,
    procedure_type_id        TEXT    NOT NULL,
    procedure_date           TEXT    NOT NULL,
    billed_amount            INTEGER NOT NULL,
    payment_method           TEXT,
    fund_reconciliation_date TEXT,
    confirmed_payment_date   TEXT,
    paid_amount              INTEGER,
    payment_status           TEXT    NOT NULL DEFAULT 'NONE',
    is_deleted               INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (patient_id)        REFERENCES patient(id),
    FOREIGN KEY (fund_id)           REFERENCES fund(id),
    FOREIGN KEY (procedure_type_id) REFERENCES procedure_type(id)
);

INSERT INTO procedure_new (
    id, patient_id, fund_id, procedure_type_id, procedure_date,
    billed_amount, payment_method, fund_reconciliation_date,
    confirmed_payment_date, paid_amount, payment_status, is_deleted
)
SELECT
    id, patient_id, fund_id, procedure_type_id, procedure_date,
    billed_amount, payment_method, fund_reconciliation_date,
    confirmed_payment_date, paid_amount, payment_status, is_deleted
FROM procedure;

DROP TABLE procedure;
ALTER TABLE procedure_new RENAME TO procedure;

-- Step 3 — recreate indexes (must mirror 20260308_init.sql).
CREATE INDEX IF NOT EXISTS idx_procedure_patient        ON procedure(patient_id);
CREATE INDEX IF NOT EXISTS idx_procedure_fund           ON procedure(fund_id);
CREATE INDEX IF NOT EXISTS idx_procedure_type           ON procedure(procedure_type_id);
CREATE INDEX IF NOT EXISTS idx_procedure_date           ON procedure(procedure_date);
CREATE INDEX IF NOT EXISTS idx_procedure_payment_status ON procedure(payment_status);
CREATE INDEX IF NOT EXISTS idx_procedure_deleted        ON procedure(is_deleted);
