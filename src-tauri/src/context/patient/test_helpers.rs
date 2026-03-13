use crate::context::patient::domain::Patient;

pub fn make_patient() -> Patient {
    make_patient_with_id("patient-1")
}

pub fn make_patient_with_id(id: &str) -> Patient {
    Patient::restore(
        id.to_string(),
        false,
        Some("Marie Dupont".to_string()),
        Some("1234567890123".to_string()),
        None,
        None,
        None,
        None,
    )
}
