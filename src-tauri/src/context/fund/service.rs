use std::sync::Arc;

use crate::{
    context::fund::{
        Fund, FundCandidate, FundPaymentGroup, FundPaymentGroupStatus, FundPaymentLine,
        FundPaymentRepository, FundRepository, FundValidationResult, FundValidationStatus,
    },
    core::event_bus::{EventBus, FundPaymentGroupUpdated, FundUpdated},
};

/// Application service for affiliated fund operations
///
/// Handles business logic and coordinates between API and repository layers.
/// Depends on FundRepository trait, not concrete implementations.
pub struct FundService {
    repository: Arc<dyn FundRepository>,
    event_bus: Arc<EventBus>,
}

impl FundService {
    pub fn new(repository: Arc<dyn FundRepository>, event_bus: Arc<EventBus>) -> Self {
        FundService {
            repository,
            event_bus,
        }
    }

    pub async fn create_fund(&self, fund_identifier: String, name: String) -> anyhow::Result<Fund> {
        let result = self.repository.create_fund(&fund_identifier, &name).await?;
        let _ = self.event_bus.publish::<FundUpdated>(FundUpdated);
        Ok(result)
    }

    pub async fn read_fund(&self, id: &str) -> anyhow::Result<Option<Fund>> {
        self.repository.read_fund(id).await
    }

    pub async fn read_all_funds(&self) -> anyhow::Result<Vec<Fund>> {
        self.repository.read_all_funds().await
    }

    pub async fn find_fund_by_identifier(&self, identifier: &str) -> anyhow::Result<Option<Fund>> {
        self.repository.find_fund_by_identifier(identifier).await
    }

    pub async fn update_fund(&self, fund: Fund) -> anyhow::Result<Fund> {
        let result = self.repository.update_fund(fund).await?;
        let _ = self.event_bus.publish::<FundUpdated>(FundUpdated);
        Ok(result)
    }

    pub async fn delete_fund(&self, id: &str) -> anyhow::Result<()> {
        self.repository.delete_fund(id).await?;
        let _ = self.event_bus.publish::<FundUpdated>(FundUpdated);
        Ok(())
    }

    /// Validate batch of fund candidates
    /// Checks for required fields and existing funds by identifier
    pub async fn validate_batch(
        &self,
        candidates: Vec<FundCandidate>,
    ) -> anyhow::Result<Vec<FundValidationResult>> {
        let mut results = Vec::new();

        for candidate in candidates {
            let mut result = FundValidationResult {
                candidate: candidate.clone(),
                status: FundValidationStatus::Valid,
                existing_id: None,
                error: None,
            };

            // Validate fund_identifier and fund_name are not empty
            if candidate.fund_identifier.is_empty() || candidate.fund_name.is_empty() {
                result.status = FundValidationStatus::Invalid;
                result.error = Some("Fund must have both identifier and name".to_string());
                results.push(result);
                continue;
            }

            // Check for existing fund by identifier
            match self
                .repository
                .find_fund_by_identifier(&candidate.fund_identifier)
                .await
            {
                Ok(Some(existing)) => {
                    result.status = FundValidationStatus::AlreadyExists;
                    result.existing_id = Some(existing.id);
                }
                Ok(None) => {
                    // Fund doesn't exist, valid for creation
                }
                Err(e) => {
                    result.status = FundValidationStatus::Invalid;
                    result.error = Some(format!("Database error checking identifier: {}", e));
                }
            }

            results.push(result);
        }

        Ok(results)
    }

    /// Create batch of valid funds
    /// Candidates should have been validated first
    pub async fn create_batch(&self, candidates: Vec<FundCandidate>) -> anyhow::Result<Vec<Fund>> {
        let mut funds: Vec<Fund> = Vec::new();

        for candidate in candidates {
            // Domain layer creates and validates each fund
            let fund = Fund::new_with_temp_id(
                candidate.fund_identifier,
                candidate.fund_name,
                candidate.temp_id,
            )?;
            funds.push(fund);
        }

        let created_funds = self.repository.create_batch(funds).await?;
        let _ = self.event_bus.publish::<FundUpdated>(FundUpdated);
        Ok(created_funds)
    }
}

// ============ Fund Payment Service ============

/// Application service for fund payment operations (basic CRUD only)
///
/// Handles basic state management of FundPaymentGroup entities without cross-context logic.
/// Cross-context concerns (procedure updates) are handled by orchestration layer in use_cases.
/// Publishes FundUpdated events on state changes (fund payment is part of fund context).
pub struct FundPaymentService {
    repository: Arc<dyn FundPaymentRepository>,
    event_bus: Arc<EventBus>,
}

impl FundPaymentService {
    pub fn new(repository: Arc<dyn FundPaymentRepository>, event_bus: Arc<EventBus>) -> Self {
        Self {
            repository,
            event_bus,
        }
    }

    /// Read a fund payment group by ID
    pub async fn read_group(&self, id: &str) -> anyhow::Result<Option<FundPaymentGroup>> {
        self.repository.read_group(id).await
    }

    /// Read fund payment lines for a specific group
    pub async fn read_lines_by_group(
        &self,
        group_id: &str,
    ) -> anyhow::Result<Vec<crate::context::fund::FundPaymentLine>> {
        self.repository.read_lines_by_group(group_id).await
    }

    /// Read all fund payment groups
    pub async fn read_all_groups(&self) -> anyhow::Result<Vec<FundPaymentGroup>> {
        self.repository.read_all_groups().await
    }

    /// Create fund payment group with procedures
    pub async fn create_group(
        &self,
        fund_id: String,
        payment_date: String,
        total_amount: i64,
        procedure_ids: Vec<String>,
        is_silent: bool,
    ) -> anyhow::Result<FundPaymentGroup> {
        tracing::info!(
            fund_id = %fund_id,
            payment_date = %payment_date,
            count = procedure_ids.len(),
            "Creating fund payment group"
        );

        let created_group = self
            .repository
            .create_group(fund_id, payment_date, total_amount, procedure_ids)
            .await?;

        if !is_silent {
            let _ = self
                .event_bus
                .publish::<crate::core::event_bus::FundPaymentGroupUpdated>(
                    crate::core::event_bus::FundPaymentGroupUpdated,
                );
        }

        Ok(created_group)
    }

    /// Check if a group with matching (fund_id, payment_date, total_amount) already exists
    pub async fn exists_group(
        &self,
        fund_id: &str,
        payment_date: &str,
        total_amount: i64,
    ) -> anyhow::Result<bool> {
        self.repository
            .exists_group(fund_id, payment_date, total_amount)
            .await
    }

    /// Update fund payment group
    pub async fn update_group(
        &self,
        group_id: String,
        payment_date: String,
        procedure_ids: Vec<String>,
        total_amount: i64,
    ) -> anyhow::Result<FundPaymentGroup> {
        tracing::info!(
            group_id = %group_id,
            payment_date = %payment_date,
            count = procedure_ids.len(),
            "Updating fund payment group"
        );

        // Update payment group
        let mut group = self
            .repository
            .read_group(&group_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Payment group not found"))?;

        // Parse payment date
        let parsed_date =
            chrono::NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d").map_err(|_| {
                anyhow::anyhow!(
                    "Invalid payment date format: {} (expected YYYY-MM-DD)",
                    payment_date
                )
            })?;

        group.payment_date = parsed_date;
        group.total_amount = total_amount;

        let updated_group = self.repository.update_group(group).await?;

        // Soft-delete old lines
        self.repository.delete_lines_by_group(&group_id).await?;

        // Create new lines using factory method (generates IDs)
        let new_lines: Vec<crate::context::fund::FundPaymentLine> = procedure_ids
            .iter()
            .map(|procedure_id| {
                crate::context::fund::FundPaymentLine::new(group_id.clone(), procedure_id.clone())
            })
            .collect::<Result<Vec<_>, _>>()?;

        if !new_lines.is_empty() {
            self.repository.create_lines(new_lines).await?;
        }

        let _ = self
            .event_bus
            .publish::<crate::core::event_bus::FundPaymentGroupUpdated>(
                crate::core::event_bus::FundPaymentGroupUpdated,
            );

        Ok(updated_group)
    }

    /// Delete fund payment lines by group ID
    pub async fn delete_lines_by_group(&self, group_id: &str) -> anyhow::Result<()> {
        self.repository.delete_lines_by_group(group_id).await
    }

    /// Create multiple fund payment groups from resolved data (batch operation)
    ///
    /// This method:
    /// 1. Creates FundPaymentGroup domain objects using factory method (generates IDs)
    /// 2. Creates FundPaymentLine domain objects for each procedure
    /// 3. Persists all groups and lines atomically via repository
    /// 4. Emits event only if !is_silent
    ///
    /// Input: Vec of tuples (fund_id, payment_date, total_amount, procedure_ids)
    /// is_silent: true for orchestration calls (event emitted at orchestrator level)
    ///            false for direct API calls
    pub async fn create_groups_batch(
        &self,
        batch_data: Vec<(String, String, i64, Vec<String>)>,
        is_silent: bool,
    ) -> anyhow::Result<Vec<FundPaymentGroup>> {
        tracing::debug!(
            count = batch_data.len(),
            "Creating batch of fund payment groups"
        );

        let mut groups = Vec::new();

        // Service layer: Create all domain objects with factory methods
        for (fund_id, payment_date, total_amount, procedure_ids) in batch_data {
            // Create group using factory (generates ID)
            let mut group = FundPaymentGroup::new(
                fund_id,
                payment_date,
                total_amount,
                vec![], // Start with empty lines
            )?;

            // Create lines using factory for each procedure
            let lines: Vec<FundPaymentLine> = procedure_ids
                .iter()
                .map(|procedure_id| FundPaymentLine::new(group.id.clone(), procedure_id.clone()))
                .collect::<Result<Vec<_>, _>>()?;

            group.lines = lines;
            groups.push(group);
        }

        // Repository layer: Persist all groups and lines atomically
        let created_groups = self.repository.create_batch_groups(groups).await?;

        // Emit event only if not silent (orchestrator will emit its own event)
        if !is_silent {
            let _ = self
                .event_bus
                .publish::<crate::core::event_bus::FundPaymentGroupUpdated>(
                    crate::core::event_bus::FundPaymentGroupUpdated,
                );
        }

        Ok(created_groups)
    }

    /// Update the bank reconciliation status of a fund payment group.
    /// Called by bank reconciliation use-cases when a bank transfer is created or deleted.
    pub async fn update_group_status(
        &self,
        group_id: &str,
        status: FundPaymentGroupStatus,
    ) -> anyhow::Result<()> {
        self.repository
            .update_group_status(group_id, status)
            .await?;
        let _ = self
            .event_bus
            .publish::<FundPaymentGroupUpdated>(FundPaymentGroupUpdated);
        Ok(())
    }

    /// Persist a fully-constructed FundPaymentGroup directly, preserving status and amount.
    /// Used for overpayment refund groups (BankPaid status + negative total_amount, REF-100).
    pub async fn persist_refund_group(
        &self,
        group: FundPaymentGroup,
    ) -> anyhow::Result<FundPaymentGroup> {
        let result = self.repository.persist_group(group).await?;

        let _ = self
            .event_bus
            .publish::<crate::core::event_bus::FundPaymentGroupUpdated>(
                crate::core::event_bus::FundPaymentGroupUpdated,
            );

        Ok(result)
    }

    /// Delete fund payment group
    pub async fn delete_group(&self, group_id: String) -> anyhow::Result<()> {
        tracing::info!(group_id = %group_id, "Deleting fund payment group");

        self.repository.delete_group(&group_id).await?;

        let _ = self
            .event_bus
            .publish::<crate::core::event_bus::FundPaymentGroupUpdated>(
                crate::core::event_bus::FundPaymentGroupUpdated,
            );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::fund::MockFundRepository;
    use anyhow::anyhow;

    fn fund_repo_create_ok() -> MockFundRepository {
        let mut mock = MockFundRepository::new();
        mock.expect_create_fund()
            .returning(|fund_identifier, fund_name| {
                Ok(Fund::restore(
                    "test-fund-id-12345".to_string(),
                    fund_identifier.to_string(),
                    fund_name.to_string(),
                ))
            });
        mock
    }

    fn fund_repo_read_all_ok() -> MockFundRepository {
        let mut mock = MockFundRepository::new();
        mock.expect_read_all_funds().returning(|| Ok(vec![]));
        mock
    }

    fn fund_repo_delete_ok() -> MockFundRepository {
        let mut mock = MockFundRepository::new();
        mock.expect_delete_fund().returning(|_| Ok(()));
        mock
    }

    fn fund_repo_failing() -> MockFundRepository {
        let mut mock = MockFundRepository::new();
        mock.expect_create_fund()
            .returning(|_, _| Err(anyhow!("Mock repository error")));
        mock.expect_read_all_funds()
            .returning(|| Err(anyhow!("Mock repository error")));
        mock.expect_delete_fund()
            .returning(|_| Err(anyhow!("Mock repository error")));
        mock
    }

    #[tokio::test]
    async fn test_add_fund_success() {
        let service = FundService::new(Arc::new(fund_repo_create_ok()), Arc::new(EventBus::new()));

        let result = service
            .create_fund("FUND-001".to_string(), "Healthcare Fund".to_string())
            .await;

        assert!(result.is_ok());
        let fund = result.unwrap();
        assert_eq!(fund.fund_identifier, "FUND-001");
        assert_eq!(fund.name, "Healthcare Fund");
    }

    #[tokio::test]
    async fn test_add_fund_repository_error_propagates() {
        let service = FundService::new(Arc::new(fund_repo_failing()), Arc::new(EventBus::new()));

        let result = service
            .create_fund("FUND-003".to_string(), "Fund".to_string())
            .await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    #[tokio::test]
    async fn test_get_all_funds_success() {
        let service =
            FundService::new(Arc::new(fund_repo_read_all_ok()), Arc::new(EventBus::new()));

        let result = service.read_all_funds().await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_get_all_funds_repository_error_propagates() {
        let service = FundService::new(Arc::new(fund_repo_failing()), Arc::new(EventBus::new()));

        let result = service.read_all_funds().await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    #[tokio::test]
    async fn test_delete_fund_success() {
        let service = FundService::new(Arc::new(fund_repo_delete_ok()), Arc::new(EventBus::new()));

        let result = service.delete_fund("test-id").await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_fund_repository_error() {
        let service = FundService::new(Arc::new(fund_repo_failing()), Arc::new(EventBus::new()));

        let result = service.delete_fund("test-id").await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    // --- FundPaymentService ---

    use crate::context::fund::MockFundPaymentRepository;

    fn make_payment_repo_ok() -> MockFundPaymentRepository {
        let mut mock = MockFundPaymentRepository::new();
        mock.expect_read_all_groups().returning(|| Ok(vec![]));
        mock.expect_create_group().returning(
            |fund_id, payment_date, total_amount, procedure_ids| {
                let lines = procedure_ids
                    .iter()
                    .map(|id| FundPaymentLine::new("group-id".to_string(), id.clone()).unwrap())
                    .collect();
                let date = chrono::NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d").unwrap();
                Ok(FundPaymentGroup::restore(
                    "group-id".to_string(),
                    fund_id,
                    date,
                    total_amount,
                    lines,
                    FundPaymentGroupStatus::Active,
                ))
            },
        );
        mock.expect_read_group().returning(|id| {
            Ok(Some(FundPaymentGroup::restore(
                id.to_string(),
                "fund-1".to_string(),
                chrono::NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                10000,
                vec![],
                FundPaymentGroupStatus::Active,
            )))
        });
        mock.expect_update_group().returning(Ok);
        mock.expect_delete_lines_by_group().returning(|_| Ok(()));
        mock.expect_create_lines().returning(Ok);
        mock.expect_delete_group().returning(|_| Ok(()));
        mock.expect_exists_group().returning(|_, _, _| Ok(false));
        mock.expect_create_batch_groups().returning(Ok);
        mock.expect_update_group_status().returning(|_, _| Ok(()));
        mock.expect_persist_group().returning(Ok);
        mock
    }

    #[tokio::test]
    async fn fund_payment_service_read_all_groups_returns_empty() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        let result = service.read_all_groups().await.unwrap();
        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn fund_payment_service_create_group_success() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        let result = service
            .create_group(
                "fund-1".to_string(),
                "2026-01-15".to_string(),
                10000,
                vec![],
                false,
            )
            .await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().fund_id, "fund-1");
    }

    #[tokio::test]
    async fn fund_payment_service_delete_group_success() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        assert!(service.delete_group("group-1".to_string()).await.is_ok());
    }

    #[tokio::test]
    async fn fund_payment_service_exists_group_returns_false() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        let result = service
            .exists_group("fund-1", "2026-01-15", 10000)
            .await
            .unwrap();
        assert!(!result);
    }

    #[tokio::test]
    async fn fund_payment_service_update_group_not_found_returns_error() {
        let mut mock = MockFundPaymentRepository::new();
        mock.expect_read_group().returning(|_| Ok(None));
        let service = FundPaymentService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service
            .update_group("g1".to_string(), "2026-01-15".to_string(), vec![], 10000)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn fund_payment_service_update_group_success() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        let result = service
            .update_group(
                "group-1".to_string(),
                "2026-01-20".to_string(),
                vec!["p1".to_string()],
                20000,
            )
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn fund_payment_service_create_groups_batch_success() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        let batch = vec![(
            "fund-1".to_string(),
            "2026-01-15".to_string(),
            10000i64,
            vec!["p1".to_string()],
        )];
        let result = service.create_groups_batch(batch, false).await;
        assert!(result.is_ok());
    }

    // --- FundService: uncovered paths ---
    use crate::context::fund::FundCandidate;

    fn make_fund() -> Fund {
        Fund::restore("f1".into(), "93".into(), "CPAM 93".into())
    }

    fn make_candidate() -> FundCandidate {
        FundCandidate {
            fund_identifier: "93".to_string(),
            fund_name: "CPAM 93".to_string(),
            temp_id: String::new(),
        }
    }

    #[tokio::test]
    async fn fund_service_read_fund_delegates_to_repo() {
        let mut mock = MockFundRepository::new();
        mock.expect_read_fund().returning(|_| {
            Ok(Some(Fund::restore(
                "f1".into(),
                "93".into(),
                "CPAM 93".into(),
            )))
        });
        let service = FundService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service.read_fund("f1").await.unwrap();
        assert!(result.is_some());
    }

    #[tokio::test]
    async fn fund_service_find_fund_by_identifier_delegates() {
        let mut mock = MockFundRepository::new();
        mock.expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        let service = FundService::new(Arc::new(mock), Arc::new(EventBus::new()));
        assert!(service
            .find_fund_by_identifier("93")
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn fund_service_update_fund_returns_updated() {
        let mut mock = MockFundRepository::new();
        mock.expect_update_fund().returning(Ok);
        let service = FundService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service.update_fund(make_fund()).await.unwrap();
        assert_eq!(result.id, "f1");
    }

    #[tokio::test]
    async fn fund_service_create_batch_returns_funds() {
        let mut mock = MockFundRepository::new();
        mock.expect_create_batch().returning(Ok);
        let service = FundService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service.create_batch(vec![make_candidate()]).await.unwrap();
        assert_eq!(result.len(), 1);
    }

    #[tokio::test]
    async fn validate_batch_valid_fund() {
        let mut mock = MockFundRepository::new();
        mock.expect_find_fund_by_identifier()
            .returning(|_| Ok(None));
        let service = FundService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let results = service
            .validate_batch(vec![make_candidate()])
            .await
            .unwrap();
        assert!(matches!(results[0].status, FundValidationStatus::Valid));
    }

    #[tokio::test]
    async fn validate_batch_already_exists() {
        let mut mock = MockFundRepository::new();
        mock.expect_find_fund_by_identifier().returning(|_| {
            Ok(Some(Fund::restore(
                "f1".into(),
                "93".into(),
                "CPAM 93".into(),
            )))
        });
        let service = FundService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let results = service
            .validate_batch(vec![make_candidate()])
            .await
            .unwrap();
        assert!(matches!(
            results[0].status,
            FundValidationStatus::AlreadyExists
        ));
        assert_eq!(results[0].existing_id.as_deref(), Some("f1"));
    }

    #[tokio::test]
    async fn validate_batch_empty_identifier_is_invalid() {
        let mock = MockFundRepository::new();
        let service = FundService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let bad = FundCandidate {
            fund_identifier: "".into(),
            fund_name: "X".into(),
            temp_id: String::new(),
        };
        let results = service.validate_batch(vec![bad]).await.unwrap();
        assert!(matches!(results[0].status, FundValidationStatus::Invalid));
        assert!(results[0].error.is_some());
    }

    #[tokio::test]
    async fn validate_batch_db_error_marks_invalid() {
        let mut mock = MockFundRepository::new();
        mock.expect_find_fund_by_identifier()
            .returning(|_| Err(anyhow!("DB error")));
        let service = FundService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let results = service
            .validate_batch(vec![make_candidate()])
            .await
            .unwrap();
        assert!(matches!(results[0].status, FundValidationStatus::Invalid));
    }

    #[tokio::test]
    async fn fund_payment_service_read_lines_by_group_delegates() {
        let mut mock = MockFundPaymentRepository::new();
        mock.expect_read_lines_by_group().returning(|_| Ok(vec![]));
        let service = FundPaymentService::new(Arc::new(mock), Arc::new(EventBus::new()));
        let result = service.read_lines_by_group("group-1").await.unwrap();
        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn fund_payment_service_update_group_status_delegates() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        let result = service
            .update_group_status("group-1", FundPaymentGroupStatus::BankPaid)
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn fund_payment_service_persist_refund_group_delegates() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        let group = FundPaymentGroup::restore(
            "g1".into(),
            "fund-1".into(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            10000,
            vec![],
            FundPaymentGroupStatus::BankPaid,
        );
        let result = service.persist_refund_group(group).await.unwrap();
        assert_eq!(result.fund_id, "fund-1");
    }

    #[tokio::test]
    async fn fund_payment_service_delete_lines_by_group_delegates() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        assert!(service.delete_lines_by_group("group-1").await.is_ok());
    }

    #[tokio::test]
    async fn fund_payment_service_read_group_returns_some() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        let result = service.read_group("group-1").await.unwrap();
        assert!(result.is_some());
    }

    #[tokio::test]
    async fn fund_payment_service_create_group_silent_does_not_panic() {
        let service =
            FundPaymentService::new(Arc::new(make_payment_repo_ok()), Arc::new(EventBus::new()));
        let result = service
            .create_group(
                "fund-1".to_string(),
                "2026-01-15".to_string(),
                10000,
                vec![],
                true,
            )
            .await;
        assert!(result.is_ok());
    }
}
