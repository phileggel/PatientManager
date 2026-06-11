use std::collections::HashMap;
use std::sync::Arc;

use crate::{
    context::patient::*,
    shared::{
        event_bus::{EventBus, PatientUpdated},
        logger::BACKEND,
    },
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
    ) -> Result<Patient, PatientError> {
        let patient = Patient::new(false, name, ssn)?;

        let result = self.repository.create_patient(patient).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "create_patient: repository failed");
            PatientError::DatabaseError
        })?;
        let _ = self.event_bus.publish::<PatientUpdated>(PatientUpdated);
        Ok(result)
    }

    /// Get a single patient by ID
    pub async fn read_patient(&self, id: &str) -> Result<Option<Patient>, PatientError> {
        self.repository.read_patient(id).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "read_patient: repository failed");
            PatientError::DatabaseError
        })
    }

    /// Get a patient by SSN
    pub async fn find_patient_by_ssn(&self, ssn: &str) -> Result<Option<Patient>, PatientError> {
        self.repository.find_patient_by_ssn(ssn).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "find_patient_by_ssn: repository failed");
            PatientError::DatabaseError
        })
    }

    /// Look up a patient by name (case-insensitive). SSN-bearing rows win
    /// over blank-SSN rows when multiple names match. See EXI-080.
    pub async fn find_patient_by_name(&self, name: &str) -> Result<Option<Patient>, PatientError> {
        self.repository.find_patient_by_name(name).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "find_patient_by_name: repository failed");
            PatientError::DatabaseError
        })
    }

    /// Get all patients
    pub async fn get_all_patients(&self) -> Result<Vec<Patient>, PatientError> {
        self.repository.read_all_patients().await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "get_all_patients: repository failed");
            PatientError::DatabaseError
        })
    }

    /// Update an existing patient
    pub async fn update_patient(&self, patient: Patient) -> Result<Patient, PatientError> {
        let result = self.repository.update_patient(patient).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "update_patient: repository failed");
            PatientError::DatabaseError
        })?;
        let _ = self.event_bus.publish::<PatientUpdated>(PatientUpdated);
        Ok(result)
    }

    /// Delete an existing patient (soft delete)
    pub async fn delete_patient(&self, id: &str) -> Result<(), PatientError> {
        self.repository.delete_patient(id).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "delete_patient: repository failed");
            PatientError::DatabaseError
        })?;
        let _ = self.event_bus.publish::<PatientUpdated>(PatientUpdated);
        Ok(())
    }

    /// Create batch of valid patients.
    /// Candidates should have been validated first.
    /// Returns the created patients alongside a `temp_id → created_id` map
    /// derived from each entity's preserved `temp_id`, so callers never have
    /// to assume positional alignment with the input list.
    pub async fn create_batch(
        &self,
        candidates: Vec<PatientCandidate>,
    ) -> Result<(Vec<Patient>, HashMap<String, String>), PatientError> {
        let mut patients: Vec<Patient> = Vec::new();

        for candidate in candidates {
            // Domain layer creates and validates each patient
            let patient =
                Patient::new_with_temp_id(false, candidate.name, candidate.ssn, candidate.temp_id)?;
            patients.push(patient);
        }

        let created_patients = self.repository.create_batch(patients).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "create_batch: repository failed");
            PatientError::DatabaseError
        })?;

        let temp_id_map: HashMap<String, String> = created_patients
            .iter()
            .filter_map(|p| p.temp_id.clone().map(|tmp| (tmp, p.id.clone())))
            .collect();

        let _ = self.event_bus.publish::<PatientUpdated>(PatientUpdated);
        Ok((created_patients, temp_id_map))
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
        mock.expect_find_patient_by_name().returning(|_| Ok(None));
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
        mock.expect_find_patient_by_name()
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

        assert!(matches!(result, Err(PatientError::DatabaseError)));
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

        assert!(matches!(result, Err(PatientError::DatabaseError)));
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

        assert!(matches!(result, Err(PatientError::DatabaseError)));
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

    // --- find_patient_by_name ---

    #[tokio::test]
    async fn find_patient_by_name_returns_none_when_not_found() {
        let repo = make_repo_ok();
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);
        let result = service.find_patient_by_name("Marie Dupont").await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn find_patient_by_name_propagates_repository_match() {
        let mut mock = MockPatientRepository::new();
        mock.expect_find_patient_by_name()
            .returning(|_| Ok(Some(make_patient_with_id("patient-77"))));
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(Arc::new(mock), event_bus);
        let result = service.find_patient_by_name("Marie Dupont").await.unwrap();
        assert_eq!(result.map(|p| p.id), Some("patient-77".to_string()));
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
        let (created, _) = service.create_batch(candidates).await.unwrap();
        assert_eq!(created.len(), 2);
    }

    #[tokio::test]
    async fn create_batch_returns_temp_id_map_keyed_by_each_input_temp_id() {
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
        let (_, map) = service.create_batch(candidates).await.unwrap();
        assert_eq!(map.len(), 2, "every input temp_id must appear in the map");
        assert!(map.contains_key("tmp-1"));
        assert!(map.contains_key("tmp-2"));
    }

    // ------------------------------------------------------------------
    // Repo-failure branch coverage: every `map_err` arm in PatientService
    // translates an `anyhow::Error` from the repository into
    // `PatientError::DatabaseError`. Existing tests cover the well-known
    // create/get/delete arms; these close the read / find_by_ssn /
    // find_by_name / update / create_batch arms.
    // ------------------------------------------------------------------

    #[tokio::test]
    async fn read_patient_translates_repo_failure_to_database_error() {
        let mut mock = MockPatientRepository::new();
        mock.expect_read_patient()
            .returning(|_| Err(anyhow::anyhow!("conn refused")));
        let service = PatientService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service.read_patient("any-id").await;
        assert!(matches!(result, Err(PatientError::DatabaseError)));
    }

    #[tokio::test]
    async fn find_patient_by_ssn_translates_repo_failure_to_database_error() {
        let mut mock = MockPatientRepository::new();
        mock.expect_find_patient_by_ssn()
            .returning(|_| Err(anyhow::anyhow!("conn refused")));
        let service = PatientService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service.find_patient_by_ssn("1234567890123").await;
        assert!(matches!(result, Err(PatientError::DatabaseError)));
    }

    #[tokio::test]
    async fn find_patient_by_name_translates_repo_failure_to_database_error() {
        let mut mock = MockPatientRepository::new();
        mock.expect_find_patient_by_name()
            .returning(|_| Err(anyhow::anyhow!("conn refused")));
        let service = PatientService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service.find_patient_by_name("Marie Dupont").await;
        assert!(matches!(result, Err(PatientError::DatabaseError)));
    }

    #[tokio::test]
    async fn update_patient_translates_repo_failure_to_database_error() {
        let mut mock = MockPatientRepository::new();
        mock.expect_update_patient()
            .returning(|_| Err(anyhow::anyhow!("conn refused")));
        let service = PatientService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let patient = make_patient_with_id("p-1");
        let result = service.update_patient(patient).await;
        assert!(matches!(result, Err(PatientError::DatabaseError)));
    }

    #[tokio::test]
    async fn create_batch_translates_repo_failure_to_database_error() {
        let mut mock = MockPatientRepository::new();
        mock.expect_create_batch()
            .returning(|_| Err(anyhow::anyhow!("conn refused")));
        let service = PatientService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let candidates = vec![PatientCandidate {
            temp_id: "tmp-1".to_string(),
            name: Some("Marie".to_string()),
            ssn: None,
        }];
        let result = service.create_batch(candidates).await;
        assert!(matches!(result, Err(PatientError::DatabaseError)));
    }
}
