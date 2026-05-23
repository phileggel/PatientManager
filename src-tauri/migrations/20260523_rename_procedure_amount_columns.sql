-- Migration: Rename procedure amount columns to UL-canonical names
--
-- `docs/ubiquitous-language.md` declares `billed_amount` and `paid_amount`
-- as the canonical terms; the BE domain, the contract, and the Specta
-- bindings already use them. The procedure table still carries the
-- legacy `procedure_amount` / `actual_payment_amount` column names —
-- this migration brings the storage layer in line.
--
-- Pure rename: SQLite ≥ 3.25.0 `ALTER TABLE … RENAME COLUMN …` preserves
-- existing data in place. No backfill, no row rewrite, no downtime
-- semantics. The matching repo row struct rename ships in the same
-- commit so sqlx-prepare regenerates against the renamed columns.

ALTER TABLE procedure
    RENAME COLUMN procedure_amount TO billed_amount;

ALTER TABLE procedure
    RENAME COLUMN actual_payment_amount TO paid_amount;
