-- A deleted procedure type is really deleted (#589, ADR-009, step 6 of #579). A flagged
-- type a procedure still uses is kept and becomes a live type once the flag is dropped
-- (R25, R26); the real database held none (#579, step 0). The Excel amount mappings and the
-- patients' latest-type defaults naming a removed type go with it, as a deletion now
-- does (PRO-280, EXI-250). The index naming the flag goes first, or SQLite refuses to
-- drop the column. The reserved type stays whatever its flag (R22).
-- IRREVERSIBLE: the flagged procedure types and their mappings are lost.

DROP INDEX idx_procedure_type_deleted;

CREATE TEMP TABLE removed_procedure_type AS
SELECT id FROM procedure_type
WHERE is_deleted = 1
  AND id <> 'import-pdf'
  AND id NOT IN (SELECT procedure_type_id FROM procedure);

DELETE FROM excel_amount_type_mapping
WHERE procedure_type_id IN (SELECT id FROM removed_procedure_type);

UPDATE patient SET latest_procedure_type = NULL, latest_date = NULL
WHERE latest_procedure_type IN (SELECT id FROM removed_procedure_type);

DELETE FROM procedure_type WHERE id IN (SELECT id FROM removed_procedure_type);

DROP TABLE removed_procedure_type;

ALTER TABLE procedure_type DROP COLUMN is_deleted;
