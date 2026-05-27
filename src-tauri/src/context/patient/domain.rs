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
        if !is_anonymous {
            match name {
                Some(n) if n.trim().is_empty() => return Err(PatientError::NameEmpty),
                None => return Err(PatientError::NonAnonymousRequiresName),
                _ => {}
            }
        }

        if let Some(s) = ssn {
            if s.len() != 13 || !s.chars().all(|c| c.is_numeric()) {
                return Err(PatientError::InvalidSsn);
            }
        }

        Ok(())
    }
}
