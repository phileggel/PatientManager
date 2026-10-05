use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

use crate::context::patient::error::PatientError;

/// Patient aggregate root
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Patient {
    pub id: String,
    pub is_anonymous: bool,
    pub name: Option<String>,
    pub ssn: Option<String>,

    /// Temporary ID used during batch imports to map temp_id → real_id
    /// None for patients created through regular API
    /// Some(uuid) for patients created via Excel import
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temp_id: Option<String>,

    /// Tracking fields for procedure defaults
    /// Updated when new procedures are created, used to pre-populate procedure form
    pub latest_procedure_type: Option<String>, // Procedure Type ID (UUID) for fast lookup
    pub latest_fund: Option<String>, // Fund ID (UUID) for fast lookup
    #[specta(type = String)]
    pub latest_date: Option<NaiveDate>, // Latest procedure date for chronological comparison
    pub latest_procedure_amount: Option<i64>, // Amount of latest procedure in thousandths of a euro
}

impl Patient {
    /// Creates a new Patient with validation and generates ID.
    pub fn new(
        is_anonymous: bool,
        name: Option<String>,
        ssn: Option<String>,
    ) -> Result<Self, PatientError> {
        Self::validate(&name, is_anonymous, &ssn)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            is_anonymous,
            name,
            ssn,
            temp_id: None,
            latest_procedure_type: None,
            latest_fund: None,
            latest_date: None,
            latest_procedure_amount: None,
        })
    }

    /// Creates a new Patient from batch import with temporary ID.
    pub fn new_with_temp_id(
        is_anonymous: bool,
        name: Option<String>,
        ssn: Option<String>,
        temp_id: String,
    ) -> Result<Self, PatientError> {
        Self::validate(&name, is_anonymous, &ssn)?;

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            is_anonymous,
            name,
            ssn,
            temp_id: Some(temp_id),
            latest_procedure_type: None,
            latest_fund: None,
            latest_date: None,
            latest_procedure_amount: None,
        })
    }

    /// Creates a Patient with an existing ID and validation.
    /// Does NOT generate a new ID.
    pub fn with_id(
        id: String,
        is_anonymous: bool,
        name: Option<String>,
        ssn: Option<String>,
    ) -> Result<Self, PatientError> {
        Self::validate(&name, is_anonymous, &ssn)?;

        Ok(Self {
            id,
            is_anonymous,
            name,
            ssn,
            temp_id: None,
            latest_procedure_type: None,
            latest_fund: None,
            latest_date: None,
            latest_procedure_amount: None,
        })
    }

    /// PDU-022, PDU-023 — what this patient becomes when `other` is merged into
    /// it: it takes the other's INS when it has none, and the other's
    /// latest-procedure defaults when those are more recent.
    pub fn absorb(mut self, other: &Patient) -> Self {
        let has_ssn = self
            .ssn
            .as_deref()
            .is_some_and(|ssn| !ssn.trim().is_empty());
        if !has_ssn {
            self.ssn = other.ssn.clone();
        }
        if other.latest_date > self.latest_date {
            self.latest_date = other.latest_date;
            self.latest_procedure_type = other.latest_procedure_type.clone();
            self.latest_fund = other.latest_fund.clone();
            self.latest_procedure_amount = other.latest_procedure_amount;
        }
        self
    }

    /// What this stored patient becomes when a user edits its name and SSN: the
    /// name trimmed, a blank SSN read as none, everything else kept. Only a value
    /// the edit changes is validated — one stored before a rule existed must not
    /// block the correction of the other.
    pub fn edit(&self, name: Option<String>, ssn: Option<String>) -> Result<Self, PatientError> {
        let name = name.map(|name| name.trim().to_string());
        let ssn = ssn
            .map(|ssn| ssn.trim().to_string())
            .filter(|ssn| !ssn.is_empty());
        // The stored values are compared as the edit is read: trimmed, blank as none.
        // Otherwise a stored value with a stray space would count as changed.
        let stored_name = self.name.as_deref().map(str::trim);
        let stored_ssn = self
            .ssn
            .as_deref()
            .map(str::trim)
            .filter(|ssn| !ssn.is_empty());
        if name.as_deref() != stored_name {
            Self::validate_name(&name, self.is_anonymous)?;
        }
        if ssn.as_deref() != stored_ssn {
            Self::validate_ssn(&ssn)?;
        }
        Ok(Self {
            name,
            ssn,
            ..self.clone()
        })
    }

    /// Restores a Patient from database storage (no validation).
    /// Data from storage is already validated.
    #[allow(clippy::too_many_arguments)]
    pub fn restore(
        id: String,
        is_anonymous: bool,
        name: Option<String>,
        ssn: Option<String>,
        latest_procedure_type: Option<String>,
        latest_fund: Option<String>,
        latest_date: Option<NaiveDate>,
        latest_procedure_amount: Option<i64>,
    ) -> Self {
        Self {
            id,
            is_anonymous,
            name,
            ssn,
            temp_id: None,
            latest_procedure_type,
            latest_fund,
            latest_date,
            latest_procedure_amount,
        }
    }

    /// Validates patient fields.
    fn validate(
        name: &Option<String>,
        is_anonymous: bool,
        ssn: &Option<String>,
    ) -> Result<(), PatientError> {
        Self::validate_name(name, is_anonymous)?;
        Self::validate_ssn(ssn)
    }

    fn validate_name(name: &Option<String>, is_anonymous: bool) -> Result<(), PatientError> {
        if !is_anonymous {
            match name {
                Some(n) if n.trim().is_empty() => return Err(PatientError::NameEmpty),
                None => return Err(PatientError::NonAnonymousRequiresName),
                _ => {}
            }
        }
        Ok(())
    }

    fn validate_ssn(ssn: &Option<String>) -> Result<(), PatientError> {
        if let Some(s) = ssn {
            // 13 ASCII digits: `is_numeric` would also accept other scripts' digits.
            if s.len() != 13 || !s.bytes().all(|b| b.is_ascii_digit()) {
                return Err(PatientError::InvalidSsn);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patient_with(ssn: Option<&str>, latest: Option<(&str, i64)>) -> Patient {
        Patient::restore(
            "p".to_string(),
            false,
            Some("Marie Dupont".to_string()),
            ssn.map(str::to_string),
            latest.map(|_| "type".to_string()),
            latest.map(|_| "fund".to_string()),
            latest.and_then(|(date, _)| date.parse().ok()),
            latest.map(|(_, amount)| amount),
        )
    }

    #[test]
    fn test_pdu_022_a_kept_patient_without_ssn_takes_the_other_one() {
        let merged = patient_with(None, None).absorb(&patient_with(Some("1234567890123"), None));
        assert_eq!(merged.ssn.as_deref(), Some("1234567890123"));
    }

    #[test]
    fn test_pdu_022_a_kept_patient_with_an_ssn_keeps_it() {
        let merged = patient_with(Some("1111111111111"), None)
            .absorb(&patient_with(Some("2222222222222"), None));
        assert_eq!(merged.ssn.as_deref(), Some("1111111111111"));
    }

    #[test]
    fn test_pdu_023_the_more_recent_tracking_fields_win() {
        let older = patient_with(None, Some(("2026-01-10", 100)));
        let newer = patient_with(None, Some(("2026-03-10", 300)));

        let merged = older.clone().absorb(&newer);
        assert_eq!(merged.latest_date, newer.latest_date);
        assert_eq!(merged.latest_procedure_amount, Some(300));

        let unchanged = newer.clone().absorb(&older);
        assert_eq!(unchanged.latest_procedure_amount, Some(300));
    }

    #[test]
    fn test_pdu_023_a_kept_patient_with_no_latest_date_takes_the_other_one() {
        let merged =
            patient_with(None, None).absorb(&patient_with(None, Some(("2026-03-10", 300))));
        assert_eq!(merged.latest_procedure_amount, Some(300));
        assert!(merged.latest_date.is_some());
    }

    #[test]
    fn an_edit_refuses_an_ssn_that_is_not_13_digits() {
        let stored = patient_with(Some("1234567890123"), None);
        let result = stored.edit(stored.name.clone(), Some("12345".to_string()));
        assert!(matches!(result, Err(PatientError::InvalidSsn)));
    }

    #[test]
    fn an_ssn_is_13_ascii_digits_and_nothing_else() {
        // Arabic-Indic digits are numeric but not ASCII; 13 bytes of them are fewer than 13 digits.
        for refused in ["١٢٣٤٥٦٧٨٩٠١٢٣", "123456789012²", "12345678901٣"] {
            let result = Patient::new(
                false,
                Some("Marie Dupont".to_string()),
                Some(refused.to_string()),
            );
            assert!(matches!(result, Err(PatientError::InvalidSsn)), "{refused}");
        }
        assert!(Patient::new(
            false,
            Some("Marie Dupont".to_string()),
            Some("1234567890123".to_string())
        )
        .is_ok());
    }

    #[test]
    fn an_edit_refuses_a_blank_name() {
        let stored = patient_with(None, None);
        let result = stored.edit(Some("   ".to_string()), None);
        assert!(matches!(result, Err(PatientError::NameEmpty)));
        let result = stored.edit(None, None);
        assert!(matches!(
            result,
            Err(PatientError::NonAnonymousRequiresName)
        ));
    }

    #[test]
    fn an_edit_validates_only_what_changed() {
        // An SSN stored before the rule existed must not block a name correction.
        let stored = patient_with(Some("legacy-ssn"), None);
        let edited = stored
            .edit(
                Some("Marie Durand".to_string()),
                Some("legacy-ssn".to_string()),
            )
            .expect("an unchanged SSN is not validated again");
        assert_eq!(edited.name.as_deref(), Some("Marie Durand"));
        assert_eq!(edited.ssn.as_deref(), Some("legacy-ssn"));
    }

    #[test]
    fn an_edit_does_not_take_a_stray_space_in_a_stored_value_for_a_change() {
        let stored = patient_with(Some(" legacy-ssn "), None);
        let edited = stored.edit(
            Some("Marie Durand".to_string()),
            Some("legacy-ssn".to_string()),
        );
        assert!(
            edited.is_ok(),
            "the SSN is the stored one, trimmed: it is not validated again"
        );
    }

    #[test]
    fn an_edit_trims_the_name_and_reads_a_blank_ssn_as_none() {
        let stored = patient_with(Some("1234567890123"), None);
        let edited = stored
            .edit(Some("  Marie Durand ".to_string()), Some("   ".to_string()))
            .expect("valid edit");
        assert_eq!(edited.name.as_deref(), Some("Marie Durand"));
        assert_eq!(edited.ssn, None);

        let edited = stored
            .edit(stored.name.clone(), Some(" 9876543210987 ".to_string()))
            .expect("valid edit");
        assert_eq!(edited.ssn.as_deref(), Some("9876543210987"));
    }

    #[test]
    fn an_edit_keeps_everything_but_the_name_and_the_ssn() {
        let stored = patient_with(None, Some(("2026-03-10", 300)));
        let edited = stored
            .edit(Some("Marie Durand".to_string()), None)
            .expect("valid edit");
        assert_eq!(edited.id, stored.id);
        assert_eq!(edited.latest_date, stored.latest_date);
        assert_eq!(edited.latest_procedure_amount, Some(300));
    }

    #[test]
    fn new_rejects_empty_name_on_non_anonymous() {
        let result = Patient::new(false, Some("   ".to_string()), None);
        assert!(matches!(result, Err(PatientError::NameEmpty)));
    }

    #[test]
    fn new_rejects_missing_name_on_non_anonymous() {
        let result = Patient::new(false, None, None);
        assert!(matches!(
            result,
            Err(PatientError::NonAnonymousRequiresName)
        ));
    }

    #[test]
    fn new_rejects_invalid_ssn_too_short() {
        let result = Patient::new(false, Some("Marie".to_string()), Some("123".to_string()));
        assert!(matches!(result, Err(PatientError::InvalidSsn)));
    }

    #[test]
    fn new_rejects_invalid_ssn_non_numeric() {
        let result = Patient::new(
            false,
            Some("Marie".to_string()),
            Some("123456789012A".to_string()),
        );
        assert!(matches!(result, Err(PatientError::InvalidSsn)));
    }

    #[test]
    fn new_accepts_anonymous_without_name_or_ssn() {
        let result = Patient::new(true, None, None);
        assert!(result.is_ok());
    }

    #[test]
    fn with_id_validates_like_new() {
        let bad = Patient::with_id("id-1".to_string(), false, Some("".to_string()), None);
        assert!(matches!(bad, Err(PatientError::NameEmpty)));
        let ok = Patient::with_id("id-1".to_string(), false, Some("Marie".to_string()), None);
        assert!(ok.is_ok());
    }
}
