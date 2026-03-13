use std::sync::Arc;

use crate::{
    context::fund::{
        AffiliatedFund, FundCandidate, FundPaymentGroup, FundPaymentLine, FundPaymentRepository,
        FundRepository, FundValidationResult, FundValidationStatus,
    },
    core::event_bus::{EventBus, FundUpdated},
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

    pub async fn create_fund(
        &self,
        fund_identifier: String,
        name: String,
    ) -> anyhow::Result<AffiliatedFund> {
        let result = self.repository.create_fund(&fund_identifier, &name).await?;
        let _ = self.event_bus.publish::<FundUpdated>(FundUpdated);
        Ok(result)
    }

    pub async fn read_fund(&self, id: &str) -> anyhow::Result<Option<AffiliatedFund>> {
        self.repository.read_fund(id).await
    }

    pub async fn read_all_funds(&self) -> anyhow::Result<Vec<AffiliatedFund>> {
        self.repository.read_all_funds().await
    }

    pub async fn find_fund_by_identifier(
        &self,
        identifier: &str,
    ) -> anyhow::Result<Option<AffiliatedFund>> {
        self.repository.find_fund_by_identifier(identifier).await
    }

    pub async fn update_fund(&self, fund: AffiliatedFund) -> anyhow::Result<AffiliatedFund> {
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
    pub async fn create_batch(
        &self,
        candidates: Vec<FundCandidate>,
    ) -> anyhow::Result<Vec<AffiliatedFund>> {
        let mut funds: Vec<AffiliatedFund> = Vec::new();

        for candidate in candidates {
            // Domain layer creates and validates each fund
            let fund = AffiliatedFund::new_with_temp_id(
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

        // Create new lines
        let new_lines: Vec<crate::context::fund::FundPaymentLine> = procedure_ids
            .iter()
            .map(|procedure_id| crate::context::fund::FundPaymentLine {
                id: String::new(), // Generated by repository
                fund_payment_group_id: group_id.clone(),
                procedure_id: procedure_id.clone(),
            })
            .collect();

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
    use anyhow::anyhow;

    /// Mock repository for testing
    struct MockFundRepository {
        should_fail: bool,
    }

    #[async_trait::async_trait]
    impl FundRepository for MockFundRepository {
        async fn create_fund(
            &self,
            fund_identifier: &str,
            fund_name: &str,
        ) -> anyhow::Result<AffiliatedFund> {
            if self.should_fail {
                // On utilise anyhow! pour créer l'erreur
                return Err(anyhow!("Mock repository error"));
            }
            Ok(AffiliatedFund {
                id: "test-fund-id-12345".to_string(),
                fund_identifier: fund_identifier.to_string(),
                name: fund_name.to_string(),
                temp_id: None,
            })
        }

        async fn read_fund(&self, _id: &str) -> anyhow::Result<Option<AffiliatedFund>> {
            Err(anyhow!("Not implemented in mock"))
        }

        async fn read_all_funds(&self) -> anyhow::Result<Vec<AffiliatedFund>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(vec![])
        }

        async fn update_fund(&self, fund: AffiliatedFund) -> anyhow::Result<AffiliatedFund> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(fund)
        }

        async fn find_fund_by_identifier(
            &self,
            _identifier: &str,
        ) -> anyhow::Result<Option<AffiliatedFund>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(None)
        }

        async fn create_batch(
            &self,
            funds: Vec<AffiliatedFund>,
        ) -> anyhow::Result<Vec<AffiliatedFund>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(funds)
        }

        async fn delete_fund(&self, _id: &str) -> anyhow::Result<()> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_add_fund_success() {
        let repo = Arc::new(MockFundRepository { should_fail: false });
        let event_bus = Arc::new(EventBus::new());
        let service = FundService::new(repo, event_bus);

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
        let repo = Arc::new(MockFundRepository { should_fail: true });
        let event_bus = Arc::new(EventBus::new());
        let service = FundService::new(repo, event_bus);

        let result = service
            .create_fund("FUND-003".to_string(), "Fund".to_string())
            .await;

        assert!(result.is_err());
        // Pour comparer une erreur anyhow, on compare sa représentation en String
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    #[tokio::test]
    async fn test_get_all_funds_success() {
        let repo = Arc::new(MockFundRepository { should_fail: false });
        let event_bus = Arc::new(EventBus::new());
        let service = FundService::new(repo, event_bus);

        let result = service.read_all_funds().await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_get_all_funds_repository_error_propagates() {
        let repo = Arc::new(MockFundRepository { should_fail: true });
        let event_bus = Arc::new(EventBus::new());
        let service = FundService::new(repo, event_bus);

        let result = service.read_all_funds().await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }

    #[tokio::test]
    async fn test_delete_fund_success() {
        let repo = Arc::new(MockFundRepository { should_fail: false });
        let event_bus = Arc::new(EventBus::new());
        let service = FundService::new(repo, event_bus);

        let result = service.delete_fund("test-id").await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_fund_repository_error() {
        let repo = Arc::new(MockFundRepository { should_fail: true });
        let event_bus = Arc::new(EventBus::new());
        let service = FundService::new(repo, event_bus);

        let result = service.delete_fund("test-id").await;

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Mock repository error");
    }
}
