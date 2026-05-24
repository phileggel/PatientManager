use std::sync::Arc;

use super::domain::{Procedure, ProcedureRepository, ProcedureType, ProcedureTypeRepository};
use crate::shared::event_bus::{EventBus, ProcedureTypeUpdated, ProcedureUpdated};
use crate::shared::logger::BACKEND;

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
        tracing::info!(target: BACKEND, procedure_name = %name, default_amount, "Adding procedure type");
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
        tracing::info!(target: BACKEND, id = %procedure_type.id, procedure_name = %procedure_type.name, "Updating procedure type");
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
        tracing::info!(target: BACKEND, id = %id, "Deleting procedure type");
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
        procedure_date: chrono::NaiveDate,
        billed_amount: Option<i64>,
        payment_method: super::domain::PaymentMethod,
        fund_reconciliation_date: Option<chrono::NaiveDate>,
        confirmed_payment_date: Option<chrono::NaiveDate>,
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
                fund_reconciliation_date,
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
                None, // fund_reconciliation_date — Stage 1 not carried by batch candidates
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
        date_min: chrono::NaiveDate,
        date_max: chrono::NaiveDate,
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
        date: chrono::NaiveDate,
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
        start_date: chrono::NaiveDate,
        end_date: chrono::NaiveDate,
    ) -> anyhow::Result<Vec<Procedure>> {
        self.repository
            .find_procedures_by_ssn_and_date_range(ssn, start_date, end_date)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::procedure::{MockProcedureTypeRepository, PaymentMethod, ProcedureStatus};
    use anyhow::anyhow;

    /// Mock that fails on every repository call exercised by the service-error tests.
    fn proc_type_repo_failing() -> MockProcedureTypeRepository {
        let mut mock = MockProcedureTypeRepository::new();
        mock.expect_find_by_name()
            .returning(|_| Err(anyhow!("Mock repository error")));
        mock.expect_delete_procedure_type()
            .returning(|_| Err(anyhow!("Mock repository error")));
        mock
    }

    /// Mock with no existing types: `find_by_name` returns None, mutating
    /// methods return their input.
    fn proc_type_repo_no_existing() -> MockProcedureTypeRepository {
        let mut mock = MockProcedureTypeRepository::new();
        mock.expect_find_by_name().returning(|_| Ok(None));
        mock.expect_create_procedure_type()
            .returning(|name, default_amount, category| {
                Ok(ProcedureType::restore(
                    "test-type-id-12345".to_string(),
                    name,
                    default_amount,
                    category,
                ))
            });
        mock.expect_update_procedure_type().returning(Ok);
        mock
    }

    /// Mock with one existing type identifiable by case-insensitive name match.
    fn proc_type_repo_with_existing(
        existing_name: &str,
        existing_id: &str,
    ) -> MockProcedureTypeRepository {
        let mut mock = MockProcedureTypeRepository::new();
        let existing_name = existing_name.to_string();
        let existing_id = existing_id.to_string();
        mock.expect_find_by_name().returning(move |query| {
            if query.to_lowercase() == existing_name.to_lowercase() {
                Ok(Some(ProcedureType::restore(
                    existing_id.clone(),
                    existing_name.clone(),
                    100000,
                    None,
                )))
            } else {
                Ok(None)
            }
        });
        mock.expect_update_procedure_type().returning(Ok);
        mock
    }

    #[tokio::test]
    async fn test_add_procedure_type_error_propagates() {
        let service = ProcedureTypeService::new(
            Arc::new(proc_type_repo_failing()),
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
            Arc::new(proc_type_repo_failing()),
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
        let service = ProcedureTypeService::new(
            Arc::new(proc_type_repo_with_existing("Consultation", "existing-id")),
            Arc::new(EventBus::new()),
        );
        let result = service
            .add_procedure_type("consultation".to_string(), 100000, None)
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("already exists"));
    }

    #[tokio::test]
    async fn test_add_procedure_type_normalizes_empty_category() {
        let service = ProcedureTypeService::new(
            Arc::new(proc_type_repo_no_existing()),
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
        let service = ProcedureTypeService::new(
            Arc::new(proc_type_repo_with_existing("Consultation", "other-id")),
            Arc::new(EventBus::new()),
        );
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
        let service = ProcedureTypeService::new(
            Arc::new(proc_type_repo_with_existing("Consultation", "my-id")),
            Arc::new(EventBus::new()),
        );
        let pt = ProcedureType::restore(
            "my-id".to_string(),
            "Consultation".to_string(),
            100000,
            None,
        );
        let result = service.update_procedure_type(pt).await;
        assert!(result.is_ok());
    }

    /// `read_procedure_type` translates a `None` from the repository into a
    /// not-found error whose message references the requested id. Without this
    /// translation the API would silently return success on a missing id.
    #[tokio::test]
    async fn test_read_procedure_type_bails_when_not_found() {
        let mut mock = MockProcedureTypeRepository::new();
        mock.expect_read_procedure_type().returning(|_| Ok(None));
        let service = ProcedureTypeService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let err = service
            .read_procedure_type("missing-id")
            .await
            .expect_err("missing id must surface as error");
        assert!(
            err.to_string().contains("not found") && err.to_string().contains("missing-id"),
            "expected not-found error referencing the id, got: {err}"
        );
    }

    /// `read_procedure_type` returns the repository's type unchanged when found.
    #[tokio::test]
    async fn test_read_procedure_type_returns_type_when_found() {
        let mut mock = MockProcedureTypeRepository::new();
        mock.expect_read_procedure_type().returning(|id| {
            Ok(Some(ProcedureType::restore(
                id.to_string(),
                "Consultation".to_string(),
                100000,
                Some("Medical".to_string()),
            )))
        });
        let service = ProcedureTypeService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service
            .read_procedure_type("type-1")
            .await
            .expect("read_procedure_type should succeed for a known id");
        assert_eq!(result.id, "type-1");
        assert_eq!(result.name, "Consultation");
        assert_eq!(result.default_amount, 100000);
    }

    /// `add_procedure_type` calls `find_by_name` BEFORE `create_procedure_type`.
    /// A `find_by_name` failure must short-circuit and never call `create`.
    #[tokio::test]
    async fn test_add_procedure_type_does_not_create_when_find_by_name_fails() {
        let mut mock = MockProcedureTypeRepository::new();
        mock.expect_find_by_name()
            .returning(|_| Err(anyhow!("Mock repository error")));
        // mockall enforces .times(0) at drop; no .returning() needed.
        mock.expect_create_procedure_type().times(0);
        let service = ProcedureTypeService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service
            .add_procedure_type("Test".to_string(), 100000, None)
            .await;
        assert!(result.is_err());
    }

    // --- ProcedureService ---

    use crate::context::procedure::MockProcedureRepository;

    fn make_mock_proc_repo() -> MockProcedureRepository {
        let mut mock = MockProcedureRepository::new();
        mock.expect_create_procedure().returning(
            |patient_id,
             fund_id,
             procedure_type_id,
             procedure_date,
             billed_amount,
             payment_method,
             fund_reconciliation_date,
             confirmed_payment_date,
             paid_amount,
             payment_status| {
                Procedure::new(
                    patient_id,
                    fund_id,
                    procedure_type_id,
                    procedure_date,
                    billed_amount,
                    payment_method,
                    fund_reconciliation_date,
                    confirmed_payment_date,
                    paid_amount,
                    payment_status,
                )
            },
        );
        mock.expect_update_procedure().returning(Ok);
        mock.expect_delete_procedure().returning(|_| Ok(()));
        mock.expect_create_batch().returning(Ok);
        mock.expect_has_blocking_procedures_in_month()
            .returning(|_| Ok(false));
        mock.expect_delete_procedures_by_month()
            .returning(|_| Ok(3));
        mock
    }

    #[tokio::test]
    async fn test_procedure_service_create_procedure_succeeds() {
        let service =
            ProcedureService::new(Arc::new(make_mock_proc_repo()), Arc::new(EventBus::new()));
        let result = service
            .create_procedure(
                "patient-1".to_string(),
                None,
                "type-1".to_string(),
                chrono::NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                Some(10000),
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_procedure_service_delete_succeeds() {
        let service =
            ProcedureService::new(Arc::new(make_mock_proc_repo()), Arc::new(EventBus::new()));
        assert!(service.delete_procedure("proc-1").await.is_ok());
    }

    #[tokio::test]
    async fn test_procedure_service_has_blocking_returns_false() {
        let service =
            ProcedureService::new(Arc::new(make_mock_proc_repo()), Arc::new(EventBus::new()));
        assert!(!service
            .has_blocking_procedures_in_month("2026-01")
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn test_procedure_service_delete_by_month_returns_count() {
        let service =
            ProcedureService::new(Arc::new(make_mock_proc_repo()), Arc::new(EventBus::new()));
        assert_eq!(
            service.delete_procedures_by_month("2026-01").await.unwrap(),
            3
        );
    }

    /// `create_batch` echoes via the mock; verify the service preserves
    /// every field of the candidates through the factory + repository round
    /// trip. A regression in `Procedure::new` or the batch path that dropped
    /// fields must surface here.
    #[tokio::test]
    async fn test_procedure_service_create_batch_propagates_fields() {
        let service =
            ProcedureService::new(Arc::new(make_mock_proc_repo()), Arc::new(EventBus::new()));
        let p = Procedure::new(
            "p1".to_string(),
            Some("fund-1".to_string()),
            "t1".to_string(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            Some(15000),
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .unwrap();
        let result = service
            .create_batch(vec![p])
            .await
            .expect("create_batch should succeed for valid Procedure::new output");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].patient_id, "p1");
        assert_eq!(result[0].fund_id.as_deref(), Some("fund-1"));
        assert_eq!(result[0].procedure_type_id, "t1");
        assert_eq!(
            result[0].procedure_date,
            chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap()
        );
        assert_eq!(result[0].billed_amount, Some(15000));
        assert_eq!(result[0].payment_status, ProcedureStatus::Created);
    }

    #[tokio::test]
    async fn test_procedure_service_update_procedure_succeeds() {
        let service =
            ProcedureService::new(Arc::new(make_mock_proc_repo()), Arc::new(EventBus::new()));
        let p = Procedure::new(
            "p1".to_string(),
            None,
            "t1".to_string(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            None,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::None,
        )
        .unwrap();
        let result = service.update_procedure(p).await;
        assert!(result.is_ok());
    }
}
