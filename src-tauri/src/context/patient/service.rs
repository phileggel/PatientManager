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
    use anyhow::anyhow;

    /// Mock repository for testing using anyhow::Result
    struct MockPatientRepository {
        should_fail: bool,
    }

    #[async_trait::async_trait]
    impl PatientRepository for MockPatientRepository {
        async fn create_patient(&self, mut patient: Patient) -> anyhow::Result<Patient> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            patient.id = "test-uuid-12345".to_string();
            Ok(patient)
        }

        async fn read_all_patients(&self) -> anyhow::Result<Vec<Patient>> {
            if self.should_fail {
                return Err(anyhow!("Database error"));
            }
            Ok(vec![make_patient_with_id("test-id")])
        }

        async fn read_patient(&self, _id: &str) -> anyhow::Result<Option<Patient>> {
            Err(anyhow!("Not implemented in mock"))
        }

        async fn update_patient(&self, _patient: Patient) -> anyhow::Result<Patient> {
            if self.should_fail {
                return Err(anyhow!("Update failed"));
            }
            // Retourne le patient passé en paramètre pour simuler l'update
            Ok(_patient)
        }

        async fn find_patient_by_ssn(&self, _ssn: &str) -> anyhow::Result<Option<Patient>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(None)
        }

        async fn create_batch(&self, mut patients: Vec<Patient>) -> anyhow::Result<Vec<Patient>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            for patient in &mut patients {
                patient.id = "test-uuid-batch".to_string();
            }
            Ok(patients)
        }

        async fn delete_patient(&self, _id: &str) -> anyhow::Result<()> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_add_patient_with_name_success() {
        let repo = Arc::new(MockPatientRepository { should_fail: false });
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
        let repo = Arc::new(MockPatientRepository { should_fail: true });
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);

        let result = service
            .create_patient(Some("Marie Dupont".to_string()), None)
            .await;

        assert!(result.is_err());
        // On compare le message d'erreur via to_string()
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    #[tokio::test]
    async fn test_get_all_patients_success() {
        let repo = Arc::new(MockPatientRepository { should_fail: false });
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
        // Test avec une structure anonyme ou locale pour varier
        struct FailingRepo;
        #[async_trait::async_trait]
        impl PatientRepository for FailingRepo {
            async fn create_patient(&self, p: Patient) -> anyhow::Result<Patient> {
                Ok(p)
            }
            async fn read_all_patients(&self) -> anyhow::Result<Vec<Patient>> {
                Err(anyhow!("Database error"))
            }
            async fn update_patient(&self, p: Patient) -> anyhow::Result<Patient> {
                Ok(p)
            }
            async fn read_patient(&self, _id: &str) -> anyhow::Result<Option<Patient>> {
                Err(anyhow!("Not implemented in mock"))
            }
            async fn find_patient_by_ssn(&self, _ssn: &str) -> anyhow::Result<Option<Patient>> {
                Err(anyhow!("Not implemented in mock"))
            }

            async fn create_batch(&self, patients: Vec<Patient>) -> anyhow::Result<Vec<Patient>> {
                Ok(patients)
            }

            async fn delete_patient(&self, _id: &str) -> anyhow::Result<()> {
                Err(anyhow!("Not implemented in mock"))
            }
        }

        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(Arc::new(FailingRepo), event_bus);
        let result = service.get_all_patients().await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Database error");
    }

    #[tokio::test]
    async fn test_delete_patient_success() {
        let repo = Arc::new(MockPatientRepository { should_fail: false });
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);

        let result = service.delete_patient("test-id").await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_patient_repository_error() {
        let repo = Arc::new(MockPatientRepository { should_fail: true });
        let event_bus = Arc::new(EventBus::new());
        let service = PatientService::new(repo, event_bus);

        let result = service.delete_patient("test-id").await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }
}
