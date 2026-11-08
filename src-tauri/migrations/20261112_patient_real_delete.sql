-- A deleted patient is really deleted (#591, ADR-009, step 8 of #579): name and SSN leave
-- the database (the backup taken before this upgrade still holds them). A flagged patient no procedure names goes with its
-- duplicate dismissals (PRO-299); one a procedure still names becomes a live patient once
-- the flag is dropped; the real database held none (#579, step 0). The index naming the
-- flag goes first, or SQLite refuses to drop the column.
-- IRREVERSIBLE: the flagged patients and their dismissals are lost.

DROP INDEX idx_patient_deleted;

DROP TABLE IF EXISTS removed_patient;
CREATE TEMP TABLE IF NOT EXISTS removed_patient AS
SELECT id FROM patient
WHERE is_deleted = 1
  AND id NOT IN (SELECT patient_id FROM procedure WHERE patient_id IS NOT NULL);

DELETE FROM patient_duplicate_dismissal
WHERE patient_a_id IN (SELECT id FROM removed_patient)
   OR patient_b_id IN (SELECT id FROM removed_patient);

DELETE FROM patient WHERE id IN (SELECT id FROM removed_patient);

DROP TABLE removed_patient;

ALTER TABLE patient DROP COLUMN is_deleted;
