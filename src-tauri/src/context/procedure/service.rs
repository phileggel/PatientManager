use std::sync::Arc;

use super::domain::{Procedure, ProcedureType};
use super::repository::{ProcedureRepository, ProcedureTypeRepository};
use crate::core::event_bus::{EventBus, ProcedureTypeUpdated, ProcedureUpdated};
use crate::core::logger::BACKEND;

/// Application service for procedure type operations
///
/// Handles business logic and coordinates between API and repository layers.
/// Depends on ProcedureTypeRepository trait, not concrete implementations.
pub struct ProcedureTypeService {
    repository: Arc<dyn ProcedureTypeRepository>,
    event_bus: Arc<EventBus>,
}

impl ProcedureTypeService {
    /// Create a new procedure type service
    pub fn new(repository: Arc<dyn ProcedureTypeRepository>, event_bus: Arc<EventBus>) -> Self {
        ProcedureTypeService {
            repository,
            event_bus,
        }
    }

    pub async fn read_all_procedure_types(&self) -> anyhow::Result<Vec<ProcedureType>> {
        self.repository.read_all_procedure_types().await
    }

    pub async fn read_procedure_type(&self, id: &str) -> anyhow::Result<ProcedureType> {
        if let Some(procedure_type) = self.repository.read_procedure_type(id).await? {
            Ok(procedure_type)
        } else {
            anyhow::bail!("Procedure type with id {} not found", id)
        }
    }

    pub async fn add_procedure_type(
        &self,
        name: String,
        default_amount: i64,
        category: Option<String>,
    ) -> anyhow::Result<ProcedureType> {
        tracing::info!(name: BACKEND, procedure_name = %name, default_amount, "Adding procedure type");
        if name.trim().is_empty() {
            anyhow::bail!("Procedure type name cannot be empty");
        }
        if default_amount < 0 {
            anyhow::bail!(
                "Default amount cannot be negative (received: {})",
                default_amount
            );
        }
        let category = category.filter(|s| !s.trim().is_empty());
        if self.repository.find_by_name(name.trim()).await?.is_some() {
            anyhow::bail!("A procedure type with this name already exists");
        }
        let result = self
            .repository
            .create_procedure_type(name.trim().to_string(), default_amount, category)
            .await?;
        let _ = self
            .event_bus
            .publish::<ProcedureTypeUpdated>(ProcedureTypeUpdated);
        Ok(result)
    }

    /// Update an existing procedure type
    pub async fn update_procedure_type(
        &self,
        procedure_type: ProcedureType,
    ) -> anyhow::Result<ProcedureType> {
        tracing::info!(name: BACKEND, id = %procedure_type.id, procedure_name = %procedure_type.name, "Updating procedure type");
        if procedure_type.id == "import-pdf" {
            anyhow::bail!("The reserved import-pdf type cannot be updated");
        }
        if let Some(existing) = self
            .repository
            .find_by_name(procedure_type.name.trim())
            .await?
        {
            if existing.id != procedure_type.id {
                anyhow::bail!("A procedure type with this name already exists");
            }
        }
        let result = self
            .repository
            .update_procedure_type(procedure_type)
            .await?;
        let _ = self
            .event_bus
            .publish::<ProcedureTypeUpdated>(ProcedureTypeUpdated);
        Ok(result)
    }

    /// Soft-delete a procedure type
    pub async fn delete_procedure_type(&self, id: &str) -> anyhow::Result<()> {
        tracing::info!(name: BACKEND, id = %id, "Deleting procedure type");
        if id == "import-pdf" {
            anyhow::bail!("The reserved import-pdf type cannot be deleted");
        }
        self.repository.delete_procedure_type(id).await?;
        let _ = self
            .event_bus
            .publish::<ProcedureTypeUpdated>(ProcedureTypeUpdated);
        Ok(())
    }
}

// ============ Healthcare Procedure Service ============

/// Application service for healthcare procedure operations (basic CRUD)
///
/// Handles basic state management of Procedure entities without cross-context logic.
/// Cross-context concerns (FK validation, patient tracking) are handled by orchestration layer.
/// Publishes ProcedureUpdated events on state changes.
pub struct ProcedureService {
    repository: Arc<dyn ProcedureRepository>,
    event_bus: Arc<EventBus>,
}

impl ProcedureService {
    /// Create a new procedure service
    pub fn new(repository: Arc<dyn ProcedureRepository>, event_bus: Arc<EventBus>) -> Self {
        ProcedureService {
            repository,
            event_bus,
        }
    }

    /// Get a single procedure by ID
    pub async fn read_procedure(&self, id: &str) -> anyhow::Result<Option<Procedure>> {
        self.repository.read_procedure(id).await
    }

    /// Get all procedures
    pub async fn read_all_procedures(&self) -> anyhow::Result<Vec<Procedure>> {
        self.repository.read_all_procedures().await
    }

    /// Get multiple procedures by their IDs
    pub async fn read_procedures_by_ids(&self, ids: Vec<String>) -> anyhow::Result<Vec<Procedure>> {
        self.repository.read_procedures_by_ids(&ids).await
    }

    /// Get all procedures for a given patient (uses idx_procedure_patient)
    pub async fn read_procedures_by_patient_id(
        &self,
        patient_id: &str,
    ) -> anyhow::Result<Vec<Procedure>> {
        self.repository
            .read_procedures_by_patient_id(patient_id)
            .await
    }

    /// Create a new procedure (basic CRUD, no cross-context logic)
    #[allow(clippy::too_many_arguments)]
    pub async fn create_procedure(
        &self,
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: String,
        billed_amount: Option<i64>,
        payment_method: super::domain::PaymentMethod,
        confirmed_payment_date: Option<String>,
        paid_amount: Option<i64>,
        payment_status: super::domain::ProcedureStatus,
    ) -> anyhow::Result<Procedure> {
        let procedure = self
            .repository
            .create_procedure(
                patient_id,
                fund_id,
                procedure_type_id,
                procedure_date,
                billed_amount,
                payment_method,
                confirmed_payment_date,
                paid_amount,
                payment_status,
            )
            .await?;

        let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);

        Ok(procedure)
    }

    /// Create multiple procedures in a single transaction (basic CRUD)
    pub async fn create_batch(&self, procedures: Vec<Procedure>) -> anyhow::Result<Vec<Procedure>> {
        let result = self.repository.create_batch(procedures).await?;

        // Publish a single event for the entire batch
        let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);

        Ok(result)
    }

    /// Create multiple procedures from candidates with optional event suppression
    ///
    /// Used for batch creation scenarios (e.g., reconciliation) where events
    /// should be controlled by the orchestrator, not the service.
    pub async fn create_procedures_batch_from_candidates(
        &self,
        candidates: Vec<super::api::ProcedureCandidate>,
        is_silent: bool,
    ) -> anyhow::Result<Vec<Procedure>> {
        // Create procedures from candidates using factory methods
        let mut procedures = Vec::new();
        for candidate in candidates {
            let procedure = Procedure::new(
                candidate.patient_id,
                candidate.fund_id,
                candidate.procedure_type_id,
                candidate.procedure_date,
                candidate.billed_amount,
                super::domain::PaymentMethod::None, // Default for batch creation
                candidate.confirmed_payment_date,
                candidate.paid_amount,
                super::domain::ProcedureStatus::None,
            )?;
            procedures.push(procedure);
        }

        // Persist all procedures in a single transaction
        let result = self.repository.create_batch(procedures).await?;

        // Publish event only if not silent
        if !is_silent {
            let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
        }

        Ok(result)
    }

    /// Update an existing procedure (basic CRUD, no cross-context logic)
    pub async fn update_procedure(&self, procedure: Procedure) -> anyhow::Result<Procedure> {
        let result = self.repository.update_procedure(procedure).await?;

        let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);

        Ok(result)
    }

    /// Update a batch of procedures in a single transaction
    pub async fn update_procedures_batch(
        &self,
        procedures: Vec<Procedure>,
        is_silent: bool,
    ) -> anyhow::Result<Vec<Procedure>> {
        let result = self.repository.update_batch(procedures).await?;

        if !is_silent {
            let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
        }

        Ok(result)
    }

    /// Delete a procedure (soft-delete)
    pub async fn delete_procedure(&self, id: &str) -> anyhow::Result<()> {
        self.repository.delete_procedure(id).await?;

        let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);

        Ok(())
    }

    /// Get unpaid procedures by fund
    pub async fn find_unpaid_by_fund(&self, fund_id: &str) -> anyhow::Result<Vec<Procedure>> {
        self.repository.find_unpaid_by_fund(fund_id).await
    }

    /// Find procedures eligible for direct payment (status CREATED, date in window).
    /// Used by bank_manual_match use_case for R14 (7-day window) and R20 (expanded search).
    pub async fn find_created_in_date_range(
        &self,
        date_min: &str,
        date_max: &str,
    ) -> anyhow::Result<Vec<Procedure>> {
        self.repository
            .find_created_in_date_range(date_min, date_max)
            .await
    }

    /// Find Created procedures for a given fund with procedure_date <= date (R19).
    /// Used by the edit modal to populate the "add procedures" selector.
    pub async fn find_created_by_fund_before_date(
        &self,
        fund_id: &str,
        date: &str,
    ) -> anyhow::Result<Vec<Procedure>> {
        self.repository
            .find_created_by_fund_before_date(fund_id, date)
            .await
    }

    /// Check if a month (YYYY-MM) has any procedures with a blocking status
    /// (RECONCILIATED or FUND_PAYED) that prevent re-import.
    pub async fn has_blocking_procedures_in_month(&self, month: &str) -> anyhow::Result<bool> {
        self.repository
            .has_blocking_procedures_in_month(month)
            .await
    }

    /// Hard-delete all procedures for a given month (YYYY-MM) before re-import.
    pub async fn delete_procedures_by_month(&self, month: &str) -> anyhow::Result<u64> {
        let deleted = self.repository.delete_procedures_by_month(month).await?;
        let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
        Ok(deleted)
    }

    /// Find procedures by SSN and date range (for reconciliation)
    pub async fn find_procedures_by_ssn_and_date_range(
        &self,
        ssn: &str,
        start_date: &str,
        end_date: &str,
    ) -> anyhow::Result<Vec<Procedure>> {
        self.repository
            .find_procedures_by_ssn_and_date_range(ssn, start_date, end_date)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::anyhow;

    struct MockProcedureTypeRepository {
        should_fail: bool,
        existing_name: Option<String>,
        existing_id: Option<String>,
    }

    impl MockProcedureTypeRepository {
        fn new() -> Self {
            Self {
                should_fail: false,
                existing_name: None,
                existing_id: None,
            }
        }
        fn failing() -> Self {
            Self {
                should_fail: true,
                existing_name: None,
                existing_id: None,
            }
        }
        fn with_existing(name: &str, id: &str) -> Self {
            Self {
                should_fail: false,
                existing_name: Some(name.to_string()),
                existing_id: Some(id.to_string()),
            }
        }
    }

    #[async_trait::async_trait]
    impl ProcedureTypeRepository for MockProcedureTypeRepository {
        async fn create_procedure_type(
            &self,
            name: String,
            default_amount: i64,
            category: Option<String>,
        ) -> anyhow::Result<ProcedureType> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(ProcedureType::restore(
                "test-type-id-12345".to_string(),
                name,
                default_amount,
                category,
            ))
        }

        async fn read_all_procedure_types(&self) -> anyhow::Result<Vec<ProcedureType>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(vec![])
        }

        async fn read_procedure_type(&self, _id: &str) -> anyhow::Result<Option<ProcedureType>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(Some(ProcedureType::restore(
                "test-type-id".to_string(),
                "Consultation".to_string(),
                100000,
                Some("Medical".to_string()),
            )))
        }

        async fn update_procedure_type(
            &self,
            procedure_type: ProcedureType,
        ) -> anyhow::Result<ProcedureType> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(procedure_type)
        }

        async fn delete_procedure_type(&self, _id: &str) -> anyhow::Result<()> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(())
        }

        async fn find_by_name(&self, name: &str) -> anyhow::Result<Option<ProcedureType>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            if let (Some(existing_name), Some(existing_id)) =
                (&self.existing_name, &self.existing_id)
            {
                if existing_name.to_lowercase() == name.to_lowercase() {
                    return Ok(Some(ProcedureType::restore(
                        existing_id.clone(),
                        existing_name.clone(),
                        100000,
                        None,
                    )));
                }
            }
            Ok(None)
        }
    }

    #[tokio::test]
    async fn test_add_procedure_type_error_propagates() {
        let service = ProcedureTypeService::new(
            Arc::new(MockProcedureTypeRepository::failing()),
            Arc::new(EventBus::new()),
        );
        let result = service
            .add_procedure_type("Test Type".to_string(), 150000, None)
            .await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    #[tokio::test]
    async fn test_delete_procedure_type_error_propagates() {
        let service = ProcedureTypeService::new(
            Arc::new(MockProcedureTypeRepository::failing()),
            Arc::new(EventBus::new()),
        );
        let result = service.delete_procedure_type("test-id").await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    #[tokio::test]
    async fn test_add_procedure_type_rejects_empty_name() {
        let service = ProcedureTypeService::new(
            Arc::new(MockProcedureTypeRepository::new()),
            Arc::new(EventBus::new()),
        );
        let result = service
            .add_procedure_type("   ".to_string(), 100000, None)
            .await;
        assert!(result.is_err());
        assert!(
            result.unwrap_err().to_string().contains("cannot be empty"),
            "Expected 'cannot be empty' error for blank name"
        );
    }

    #[tokio::test]
    async fn test_add_procedure_type_rejects_negative_amount() {
        let service = ProcedureTypeService::new(
            Arc::new(MockProcedureTypeRepository::new()),
            Arc::new(EventBus::new()),
        );
        let result = service
            .add_procedure_type("Valid Name".to_string(), -1, None)
            .await;
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("cannot be negative"),
            "Expected 'cannot be negative' error for negative amount"
        );
    }

    #[tokio::test]
    async fn test_add_procedure_type_rejects_duplicate_name() {
        let repo = Arc::new(MockProcedureTypeRepository::with_existing(
            "Consultation",
            "existing-id",
        ));
        let service = ProcedureTypeService::new(repo, Arc::new(EventBus::new()));
        let result = service
            .add_procedure_type("consultation".to_string(), 100000, None)
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));
    }

    #[tokio::test]
    async fn test_add_procedure_type_normalizes_empty_category() {
        let service = ProcedureTypeService::new(
            Arc::new(MockProcedureTypeRepository::new()),
            Arc::new(EventBus::new()),
        );
        let result = service
            .add_procedure_type("Test".to_string(), 100000, Some("  ".to_string()))
            .await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().category, None);
    }

    #[tokio::test]
    async fn test_update_procedure_type_rejects_import_pdf() {
        let service = ProcedureTypeService::new(
            Arc::new(MockProcedureTypeRepository::new()),
            Arc::new(EventBus::new()),
        );
        let pt = ProcedureType::restore("import-pdf".to_string(), "Import".to_string(), 0, None);
        let result = service.update_procedure_type(pt).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("import-pdf"));
    }

    #[tokio::test]
    async fn test_delete_procedure_type_rejects_import_pdf() {
        let service = ProcedureTypeService::new(
            Arc::new(MockProcedureTypeRepository::new()),
            Arc::new(EventBus::new()),
        );
        let result = service.delete_procedure_type("import-pdf").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("import-pdf"));
    }

    #[tokio::test]
    async fn test_update_procedure_type_rejects_duplicate_name() {
        let repo = Arc::new(MockProcedureTypeRepository::with_existing(
            "Consultation",
            "other-id",
        ));
        let service = ProcedureTypeService::new(repo, Arc::new(EventBus::new()));
        let pt = ProcedureType::restore(
            "my-id".to_string(),
            "CONSULTATION".to_string(),
            100000,
            None,
        );
        let result = service.update_procedure_type(pt).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));
    }

    #[tokio::test]
    async fn test_update_procedure_type_allows_same_name_same_id() {
        let repo = Arc::new(MockProcedureTypeRepository::with_existing(
            "Consultation",
            "my-id",
        ));
        let service = ProcedureTypeService::new(repo, Arc::new(EventBus::new()));
        let pt = ProcedureType::restore(
            "my-id".to_string(),
            "Consultation".to_string(),
            100000,
            None,
        );
        let result = service.update_procedure_type(pt).await;
        assert!(result.is_ok());
    }
}
