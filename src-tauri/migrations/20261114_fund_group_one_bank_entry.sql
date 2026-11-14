-- BSM-038, BSM-038A (#640): a fund payment group is linked to one bank entry at most.
--
-- A database that already holds a group linked twice is not upgraded (owner, 2026-11-14):
-- the first statement fails on it and its error names the group, so the double link is
-- repaired by hand before the upgrade runs again. SQLite 3.46 has no RAISE outside a
-- trigger and none with a computed message; json_extract's error quotes the path it is
-- given, which carries the group's id here (tests/migration_fund_group_one_bank_entry.rs
-- holds the message).

SELECT json_extract('{}', 'fund payment group linked to two bank entries: ' || fund_payment_group_id)
FROM bank_transfer_fund_group_link
GROUP BY fund_payment_group_id
HAVING COUNT(*) > 1;

DROP INDEX IF EXISTS idx_bt_fund_group_group;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bt_fund_group_group
    ON bank_transfer_fund_group_link(fund_payment_group_id);
