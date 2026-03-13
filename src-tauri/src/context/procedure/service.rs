use std::sync::Arc;

use super::domain::{Procedure, ProcedureType};
use super::repository::{ProcedureRepository, ProcedureTypeRepository};
use crate::core::event_bus::{EventBus, ProcedureTypeUpdated, ProcedureUpdated};

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
        let result = self
            .repository
            .create_procedure_type(name, default_amount, category)
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

    /// Create a new procedure (basic CRUD, no cross-context logic)
    #[allow(clippy::too_many_arguments)]
    pub async fn create_procedure(
        &self,
        patient_id: String,
        fund_id: Option<String>,
        procedure_type_id: String,
        procedure_date: String,
        procedure_amount: Option<i64>,
        payment_method: super::domain::PaymentMethod,
        confirmed_payment_date: Option<String>,
        actual_payment_amount: Option<i64>,
        payment_status: super::domain::ProcedureStatus,
    ) -> anyhow::Result<Procedure> {
        let procedure = self
            .repository
            .create_procedure(
                patient_id,
                fund_id,
                procedure_type_id,
                procedure_date,
                procedure_amount,
                payment_method,
                confirmed_payment_date,
                actual_payment_amount,
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
                candidate.procedure_amount,
                super::domain::PaymentMethod::None, // Default for batch creation
                candidate.confirmed_payment_date,
                candidate.actual_payment_amount,
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

    /// Mock repository for testing using anyhow::Result
    struct MockProcedureTypeRepository {
        should_fail: bool,
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
            Ok(ProcedureType {
                id: "test-type-id-12345".to_string(),
                name,
                default_amount,
                category,
            })
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
            Ok(Some(ProcedureType {
                id: "test-type-id".to_string(),
                name: "Consultation".to_string(),
                default_amount: 100000,
                category: Some("Medical".to_string()),
            }))
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

        async fn find_by_name(&self, _name: &str) -> anyhow::Result<Option<ProcedureType>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(None)
        }
    }

    #[tokio::test]
    async fn test_add_procedure_type_success() {
        let repo = Arc::new(MockProcedureTypeRepository { should_fail: false });
        let service = ProcedureTypeService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .add_procedure_type(
                "Consultation".to_string(),
                100000,
                Some("Medical".to_string()),
            )
            .await;

        assert!(result.is_ok());
        let pt = result.unwrap();
        assert_eq!(pt.name, "Consultation");
    }

    #[tokio::test]
    async fn test_add_procedure_type_error_propagates() {
        let repo = Arc::new(MockProcedureTypeRepository { should_fail: true });
        let service = ProcedureTypeService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .add_procedure_type("Test Type".to_string(), 150000, None)
            .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    #[tokio::test]
    async fn test_read_procedure_type_success() {
        let repo = Arc::new(MockProcedureTypeRepository { should_fail: false });
        let service = ProcedureTypeService::new(repo, Arc::new(EventBus::new()));

        let result = service.read_procedure_type("test-id").await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().name, "Consultation");
    }

    #[tokio::test]
    async fn test_update_procedure_type_success() {
        let repo = Arc::new(MockProcedureTypeRepository { should_fail: false });
        let service = ProcedureTypeService::new(repo, Arc::new(EventBus::new()));

        let pt = ProcedureType {
            id: "test-id".to_string(),
            name: "Updated Type".to_string(),
            default_amount: 200000,
            category: None,
        };

        let result = service.update_procedure_type(pt).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().name, "Updated Type");
    }

    #[tokio::test]
    async fn test_delete_procedure_type_error_propagates() {
        let repo = Arc::new(MockProcedureTypeRepository { should_fail: true });
        let service = ProcedureTypeService::new(repo, Arc::new(EventBus::new()));

        let result = service.delete_procedure_type("test-id").await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }
}
