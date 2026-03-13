-- ============================================================================
-- Patient
-- ============================================================================
CREATE TABLE IF NOT EXISTS patient (
    id                      TEXT    PRIMARY KEY NOT NULL,
    is_anonymous            INTEGER NOT NULL DEFAULT 0,
    name                    TEXT,
    ssn                     TEXT,
    latest_procedure_type   TEXT,
    latest_fund             TEXT,
    latest_date             TEXT,
    latest_procedure_amount INTEGER,
    is_deleted              INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_patient_ssn          ON patient(ssn);
CREATE INDEX IF NOT EXISTS idx_patient_is_anonymous ON patient(is_anonymous);
CREATE INDEX IF NOT EXISTS idx_patient_deleted      ON patient(is_deleted);

-- ============================================================================
-- Fund
-- ============================================================================
CREATE TABLE IF NOT EXISTS fund (
    id               TEXT PRIMARY KEY NOT NULL,
    fund_identifier  TEXT NOT NULL,
    name             TEXT NOT NULL,
    is_deleted       INTEGER NOT NULL DEFAULT 0
);

-- Unique only for active (non-deleted) records
CREATE UNIQUE INDEX IF NOT EXISTS idx_fund_identifier_active
    ON fund(fund_identifier)
    WHERE is_deleted = 0;

-- ============================================================================
-- Procedure Type
-- ============================================================================
CREATE TABLE IF NOT EXISTS procedure_type (
    id             TEXT    PRIMARY KEY NOT NULL,
    name           TEXT    NOT NULL,
    default_amount INTEGER NOT NULL,
    category       TEXT,
    is_deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_procedure_type_deleted ON procedure_type(is_deleted);

-- ============================================================================
-- Procedure
-- ============================================================================
CREATE TABLE IF NOT EXISTS procedure (
    id                     TEXT    PRIMARY KEY NOT NULL,
    patient_id             TEXT    NOT NULL,
    fund_id                TEXT,
    procedure_type_id      TEXT    NOT NULL,
    procedure_date         TEXT    NOT NULL,
    procedure_amount       INTEGER,
    payment_method         TEXT,
    confirmed_payment_date TEXT,
    actual_payment_amount  INTEGER,
    payment_status         TEXT    NOT NULL DEFAULT 'NONE',
    is_deleted             INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (patient_id)        REFERENCES patient(id),
    FOREIGN KEY (fund_id)           REFERENCES fund(id),
    FOREIGN KEY (procedure_type_id) REFERENCES procedure_type(id)
);

CREATE INDEX IF NOT EXISTS idx_procedure_patient        ON procedure(patient_id);
CREATE INDEX IF NOT EXISTS idx_procedure_fund           ON procedure(fund_id);
CREATE INDEX IF NOT EXISTS idx_procedure_type           ON procedure(procedure_type_id);
CREATE INDEX IF NOT EXISTS idx_procedure_date           ON procedure(procedure_date);
CREATE INDEX IF NOT EXISTS idx_procedure_payment_status ON procedure(payment_status);
CREATE INDEX IF NOT EXISTS idx_procedure_deleted        ON procedure(is_deleted);

-- ============================================================================
-- Fund Payment Group
-- ============================================================================
CREATE TABLE IF NOT EXISTS fund_payment_group (
    id           TEXT    PRIMARY KEY NOT NULL,
    fund_id      TEXT    NOT NULL,
    payment_date TEXT    NOT NULL,
    total_amount INTEGER NOT NULL,
    is_deleted   INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (fund_id) REFERENCES fund(id)
);

CREATE INDEX IF NOT EXISTS idx_fund_payment_group_date    ON fund_payment_group(payment_date);
CREATE INDEX IF NOT EXISTS idx_fund_payment_group_fund    ON fund_payment_group(fund_id);
CREATE INDEX IF NOT EXISTS idx_fund_payment_group_deleted ON fund_payment_group(is_deleted);

-- ============================================================================
-- Fund Payment Line
-- ============================================================================
CREATE TABLE IF NOT EXISTS fund_payment_line (
    id                    TEXT    PRIMARY KEY NOT NULL,
    fund_payment_group_id TEXT    NOT NULL,
    procedure_id          TEXT    NOT NULL,
    is_deleted            INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (fund_payment_group_id) REFERENCES fund_payment_group(id),
    FOREIGN KEY (procedure_id)          REFERENCES procedure(id)
);

CREATE INDEX IF NOT EXISTS idx_fund_payment_line_group     ON fund_payment_line(fund_payment_group_id);
CREATE INDEX IF NOT EXISTS idx_fund_payment_line_procedure ON fund_payment_line(procedure_id);
CREATE INDEX IF NOT EXISTS idx_fund_payment_line_deleted   ON fund_payment_line(is_deleted);

-- ============================================================================
-- Bank Account
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_account (
    id         TEXT    PRIMARY KEY NOT NULL,
    name       TEXT    NOT NULL,
    iban       TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_account_name_active
    ON bank_account(name)
    WHERE is_deleted = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_account_iban_active
    ON bank_account(iban)
    WHERE is_deleted = 0 AND iban IS NOT NULL;

-- ============================================================================
-- Bank Transfer
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_transfer (
    id              TEXT    PRIMARY KEY NOT NULL,
    transfer_date   TEXT    NOT NULL,
    amount          INTEGER NOT NULL,
    transfer_type   TEXT    NOT NULL,
    bank_account_id TEXT    NOT NULL,
    source          TEXT    NOT NULL,
    is_deleted      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (bank_account_id) REFERENCES bank_account(id)
);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_date    ON bank_transfer(transfer_date);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_type    ON bank_transfer(transfer_type);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_source  ON bank_transfer(source);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_deleted ON bank_transfer(is_deleted);
CREATE INDEX IF NOT EXISTS idx_bank_transfer_account ON bank_transfer(bank_account_id);

-- ============================================================================
-- Bank Fund Label Mapping
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_fund_label_mapping (
    id               TEXT    PRIMARY KEY NOT NULL,
    bank_account_id  TEXT    NOT NULL,
    bank_label       TEXT    NOT NULL,
    fund_id          TEXT,
    is_deleted       INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (bank_account_id) REFERENCES bank_account(id),
    FOREIGN KEY (fund_id)         REFERENCES fund(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_fund_label_active
    ON bank_fund_label_mapping(bank_account_id, bank_label)
    WHERE is_deleted = 0;

-- ============================================================================
-- Seeds
-- ============================================================================
INSERT INTO procedure_type (id, name, default_amount, category, is_deleted)
VALUES ('import-pdf', 'Import PDF', 0, 'Import', 0)
ON CONFLICT(id) DO NOTHING;
