use std::sync::Arc;

use crate::{
    context::patient::*,
    core::event_bus::{EventBus, PatientUpdated},
};

/// Application service for patient operations
///
/// Handles business logic and coordinates between API and repository layers.
/// Depends on PatientRepository trait, not concrete implementations.
pub struct PatientService {
    repository: Arc<dyn PatientRepository>,
    event_bus: Arc<EventBus>,
}

impl PatientService {
    /// Create a new patient service
    pub fn new(repository: Arc<dyn PatientRepository>, event_bus: Arc<EventBus>) -> Self {
        PatientService {
            repository,
            event_bus,
        }
    }

    /// Add a new patient with optional name, SSN, and fund patient name
    pub async fn create_patient(
        &self,
        name: Option<String>,
        ssn: Option<String>,
    ) -> anyhow::Result<Patient> {
        // Domain layer creates and validates the patient
        let patient = Patient::new(false, name, ssn)?;

        let result = self.repository.create_patient(patient).await?;
        let _ = self.event_bus.publish::<PatientUpdated>(PatientUpdated);
        Ok(result)
    }

    /// Get a single patient by ID
    pub async fn read_patient(&self, id: &str) -> anyhow::Result<Option<Patient>> {
        self.repository.read_patient(id).await
    }

    /// Get a patient by SSN
    pub async fn find_patient_by_ssn(&self, ssn: &str) -> anyhow::Result<Option<Patient>> {
        self.repository.find_patient_by_ssn(ssn).await
    }

    /// Get all patients
    pub async fn get_all_patients(&self) -> anyhow::Result<Vec<Patient>> {
        self.repository.read_all_patients().await
    }

    /// Update an existing patient
    pub async fn update_patient(&self, patient: Patient) -> anyhow::Result<Patient> {
        let result = self.repository.update_patient(patient).await?;
        let _ = self.event_bus.publish::<PatientUpdated>(PatientUpdated);
        Ok(result)
    }

    /// Delete an existing patient (soft delete)
    pub async fn delete_patient(&self, id: &str) -> anyhow::Result<()> {
        self.repository.delete_patient(id).await?;
        let _ = self.event_bus.publish::<PatientUpdated>(PatientUpdated);
        Ok(())
    }

    /// Validate batch of patient candidates
    /// Checks for required fields and existing patients by SSN
    pub async fn validate_batch(
        &self,
        candidates: Vec<PatientCandidate>,
    ) -> anyhow::Result<Vec<PatientValidationResult>> {
        let mut results = Vec::new();

        for candidate in candidates {
            let mut result = PatientValidationResult {
                candidate: candidate.clone(),
                status: PatientValidationStatus::Valid,
                existing_id: None,
                error: None,
            };

            // Validate at least name or SSN present
            if candidate.name.is_none() && candidate.ssn.is_none() {
                result.status = PatientValidationStatus::Invalid;
                result.error = Some("Patient must have either name or SSN".to_string());
                results.push(result);
                continue;
            }

            // Check for existing patient by SSN if provided
            if let Some(ssn) = &candidate.ssn {
                match self.repository.find_patient_by_ssn(ssn).await {
                    Ok(Some(existing)) => {
                        result.status = PatientValidationStatus::AlreadyExists;
                        result.existing_id = Some(existing.id);
                    }
                    Ok(None) => {
                        // Patient doesn't exist, valid for creation
                    }
                    Err(e) => {
                        result.status = PatientValidationStatus::Invalid;
                        result.error = Some(format!("Database error checking SSN: {}", e));
                    }
                }
            }

            results.push(result);
        }

        Ok(results)
    }

    /// Create batch of valid patients
    /// Candidates should have been validated first
    pub async fn create_batch(
        &self,
        candidates: Vec<PatientCandidate>,
    ) -> anyhow::Result<Vec<Patient>> {
        let mut patients: Vec<Patient> = Vec::new();

        for candidate in candidates {
            // Domain layer creates and validates each patient
            let patient =
                Patient::new_with_temp_id(false, candidate.name, candidate.ssn, candidate.temp_id)?;
            patients.push(patient);
        }

        let created_patients = self.repository.create_batch(patients).await?;
        let _ = self.event_bus.publish::<PatientUpdated>(PatientUpdated);
        Ok(created_patients)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::patient::test_helpers::make_patient_with_id;
    use crate::context::patient::MockPatientRepository;

    fn make_repo_ok() -> Arc<MockPatientRepository> {
        let mut mock = MockPatientRepository::new();
        mock.expect_create_patient().returning(|mut p| {
            p.id = "test-uuid-12345".to_string();
            Ok(p)
        });
        mock.expect_read_all_patients()
            .returning(|| Ok(vec![make_patient_with_id("test-id")]));
        mock.expect_read_patient()
            .returning(|_| Err(anyhow::anyhow!("Not implemented in mock")));
        mock.expect_update_patient().returning(Ok);
        mock.expect_find_patient_by_ssn().returning(|_| Ok(None));
        mock.expect_create_batch().returning(|mut patients| {
            for p in &mut patients {
                p.id = "test-uuid-batch".to_string();
            }
            Ok(patients)
        });
        mock.expect_delete_patient().returning(|_| Ok(()));
        Arc::new(mock)
    }

    fn make_repo_fail() -> Arc<MockPatientRepository> {
        let mut mock = MockPatientRepository::new();
        mock.expect_create_patient()
            .returning(|_| Err(anyhow::anyhow!("Mock repository error")));
        mock.expect_read_all_patients()
            .returning(|| Err(anyhow::anyhow!("Mock repository error")));
        mock.expect_read_patient()
            .returning(|_| Err(anyhow::anyhow!("Mock repository error")));
        mock.expect_update_patient()
            .returning(|_| Err(anyhow::anyhow!("Update failed")));
        mock.expect_find_patient_by_ssn()
            .returning(|_| Err(anyhow::anyhow!("Mock repository error")));
        mock.expect_create_batch()
            .returning(|_| Err(anyhow::anyhow!("Mock repository error")));
        mock.expect_delete_patient()
            .returning(|_| Err(anyhow::anyhow!("Mock repository error")));
        Arc::new(mock)
    }

    #[tokio::test]
    async fn test_add_patient_with_name_success() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);

        let result = service
            .create_patient(Some("Marie Dupont".to_string()), None)
            .await;

        assert!(result.is_ok());
        let patient = result.unwrap();
        assert_eq!(patient.name, Some("Marie Dupont".to_string()));
        assert_eq!(patient.id, "test-uuid-12345");
    }

    #[tokio::test]
    async fn test_add_patient_repository_error_propagates() {
        let repo = make_repo_fail();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);

        let result = service
            .create_patient(Some("Marie Dupont".to_string()), None)
            .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    #[tokio::test]
    async fn test_get_all_patients_success() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);

        let result = service.get_all_patients().await;

        assert!(result.is_ok());
        let patients = result.unwrap();
        assert_eq!(patients.len(), 1);
        assert_eq!(patients[0].name, Some("Marie Dupont".to_string()));
    }

    #[tokio::test]
    async fn test_get_all_patients_repository_error() {
        let mut mock = MockPatientRepository::new();
        mock.expect_read_all_patients()
            .returning(|| Err(anyhow::anyhow!("Database error")));

        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(Arc::new(mock), event_bus);
        let result = service.get_all_patients().await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Database error");
    }

    #[tokio::test]
    async fn test_delete_patient_success() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);

        let result = service.delete_patient("test-id").await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_patient_repository_error() {
        let repo = make_repo_fail();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);

        let result = service.delete_patient("test-id").await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    // --- read_patient ---

    #[tokio::test]
    async fn read_patient_returns_patient_from_repository() {
        let mut mock = MockPatientRepository::new();
        mock.expect_read_patient()
            .returning(|id| Ok(Some(make_patient_with_id(id))));
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(Arc::new(mock), event_bus);
        let result = service.read_patient("patient-42").await.unwrap();
        assert!(result.is_some());
        assert_eq!(result.unwrap().id, "patient-42");
    }

    // --- find_patient_by_ssn ---

    #[tokio::test]
    async fn find_patient_by_ssn_returns_none_when_not_found() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);
        let result = service.find_patient_by_ssn("1234567890123").await.unwrap();
        assert!(result.is_none());
    }

    // --- update_patient ---

    #[tokio::test]
    async fn update_patient_returns_updated_patient() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);
        let patient = make_patient_with_id("patient-42");
        let updated = service.update_patient(patient.clone()).await.unwrap();
        assert_eq!(updated.id, "patient-42");
    }

    // --- validate_batch ---

    #[tokio::test]
    async fn validate_batch_empty_returns_empty() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);
        let result = service.validate_batch(vec![]).await.unwrap();
        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn validate_batch_no_name_and_no_ssn_returns_invalid() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);
        let candidate = PatientCandidate {
            temp_id: "tmp-1".to_string(),
            name: None,
            ssn: None,
        };
        let results = service.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, PatientValidationStatus::Invalid);
    }

    #[tokio::test]
    async fn validate_batch_existing_ssn_returns_already_exists() {
        let mut mock = MockPatientRepository::new();
        mock.expect_find_patient_by_ssn()
            .returning(|_| Ok(Some(make_patient_with_id("existing-id"))));
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(Arc::new(mock), event_bus);
        let candidate = PatientCandidate {
            temp_id: "tmp-1".to_string(),
            name: Some("Marie Dupont".to_string()),
            ssn: Some("1234567890123".to_string()),
        };
        let results = service.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, PatientValidationStatus::AlreadyExists);
        assert_eq!(results[0].existing_id, Some("existing-id".to_string()));
    }

    #[tokio::test]
    async fn validate_batch_new_patient_with_name_returns_valid() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);
        let candidate = PatientCandidate {
            temp_id: "tmp-1".to_string(),
            name: Some("Pierre Martin".to_string()),
            ssn: None,
        };
        let results = service.validate_batch(vec![candidate]).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, PatientValidationStatus::Valid);
    }

    // --- create_batch ---

    #[tokio::test]
    async fn create_batch_creates_all_candidates() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);
        let candidates = vec![
            PatientCandidate {
                temp_id: "tmp-1".to_string(),
                name: Some("Alice".to_string()),
                ssn: None,
            },
            PatientCandidate {
                temp_id: "tmp-2".to_string(),
                name: Some("Bob".to_string()),
                ssn: Some("9876543210987".to_string()),
            },
        ];
        let result = service.create_batch(candidates).await.unwrap();
        assert_eq!(result.len(), 2);
    }
}
