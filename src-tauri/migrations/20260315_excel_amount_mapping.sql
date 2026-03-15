-- Excel amount → procedure type mapping memory
-- Stores the user's last-used mapping choices so they are pre-filled on next import.

CREATE TABLE IF NOT EXISTS excel_amount_type_mapping (
    id                TEXT    PRIMARY KEY NOT NULL,
    amount            INTEGER NOT NULL,
    procedure_type_id TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_excel_amount_type_mapping_amount
    ON excel_amount_type_mapping(amount);
