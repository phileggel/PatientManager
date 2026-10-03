-- PDU-030: the user's statement that two patients with the same name are
-- different people. A pair has no direction, so it is stored once, smaller
-- identifier first (the CHECK), and the unique index refuses a second row.

CREATE TABLE IF NOT EXISTS patient_duplicate_dismissal (
    id            TEXT PRIMARY KEY NOT NULL,
    patient_a_id  TEXT NOT NULL,
    patient_b_id  TEXT NOT NULL,
    FOREIGN KEY (patient_a_id) REFERENCES patient(id),
    FOREIGN KEY (patient_b_id) REFERENCES patient(id),
    CHECK (patient_a_id < patient_b_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_duplicate_dismissal_pair
    ON patient_duplicate_dismissal(patient_a_id, patient_b_id);
CREATE INDEX IF NOT EXISTS idx_patient_duplicate_dismissal_b
    ON patient_duplicate_dismissal(patient_b_id);
