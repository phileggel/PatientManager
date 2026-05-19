use chrono::NaiveDate;
use std::sync::Arc;

use crate::context::fund::{FundPaymentGroup, FundPaymentService};
use crate::context::procedure::{Procedure, ProcedureService, ProcedureStatus};
use crate::shared::event_bus::{EventBus, FundPaymentGroupUpdated, ProcedureUpdated};
use crate::shared::logger::BACKEND;

/// Orchestrator for manual CRUD on fund payment groups (FundPaymentManager page)
///
/// Coordinates writes across the `fund` and `procedure` bounded contexts:
/// creating/updating/deleting a fund payment group requires synchronously
/// transitioning the linked procedures' lifecycle (Reconciled / Created)
/// in lockstep with the group's lifecycle.
///
/// Sibling to `FundPaymentReconciliationOrchestrator`, which handles the
/// PDF-driven auto-reconciliation flow. The two are intentionally separate
/// because their input shape, business rules, and FE entry points differ
/// (manual = user-picked procedures from the management page; auto = PDF
/// lines + matching algorithm from the reconciliation modal).
pub struct FundPaymentManualManagementOrchestrator {
    procedure_service: Arc<ProcedureService>,
    fund_payment_service: Arc<FundPaymentService>,
    event_bus: Arc<EventBus>,
}

impl FundPaymentManualManagementOrchestrator {
    pub fn new(
        procedure_service: Arc<ProcedureService>,
        fund_payment_service: Arc<FundPaymentService>,
        event_bus: Arc<EventBus>,
    ) -> Self {
        Self {
            procedure_service,
            fund_payment_service,
            event_bus,
        }
    }

    /// Create a fund payment group from manual UI selection (R4, R8)
    ///
    /// Steps:
    /// 1. Load procedures to calculate total_amount (R4)
    /// 2. Create the fund payment group
    /// 3. Set each procedure to Reconciled + confirmed_payment_date + paid_amount (R8)
    /// 4. Publish events
    pub async fn create_group(
        &self,
        fund_id: String,
        payment_date: String,
        procedure_ids: Vec<String>,
    ) -> anyhow::Result<FundPaymentGroup> {
        tracing::info!(
            target: BACKEND,
            fund_id = %fund_id,
            payment_date = %payment_date,
            procedure_count = procedure_ids.len(),
            "Creating manual fund payment group"
        );

        // Step 1: Load procedures and calculate total_amount (R4)
        let procedures = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids.clone())
            .await?;

        let total_amount: i64 = procedures
            .iter()
            .map(|p| p.billed_amount.unwrap_or(0))
            .sum();

        let parsed_payment_date =
            NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d").map_err(|_| {
                anyhow::anyhow!(
                    "Invalid payment date format: {} (expected YYYY-MM-DD)",
                    payment_date
                )
            })?;

        // Step 2: Create the group (silent — we publish at the end)
        let group = self
            .fund_payment_service
            .create_group(
                fund_id,
                payment_date.clone(),
                total_amount,
                procedure_ids,
                true,
            )
            .await?;

        tracing::info!(target: BACKEND, group_id = %group.id, total_amount, "Manual fund payment group created");

        // Step 3: Update procedures — Reconciled + confirmed_payment_date + paid_amount (R8)
        let updated_procedures: Vec<_> = procedures
            .into_iter()
            .map(|mut p| {
                p.payment_status = ProcedureStatus::Reconciled;
                p.confirmed_payment_date = Some(parsed_payment_date);
                p.paid_amount = p.billed_amount;
                p
            })
            .collect();

        self.procedure_service
            .update_procedures_batch(updated_procedures, true)
            .await?;

        // Step 4: Publish events
        let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
        let _ = self
            .event_bus
            .publish::<FundPaymentGroupUpdated>(FundPaymentGroupUpdated);

        Ok(group)
    }

    /// Update a fund payment group from a manual UI edit (R4, R7, R8, R9)
    ///
    /// Steps:
    /// 1. Load existing group and check for bank-reconciled lock (R9)
    /// 2. Detect removed and added procedures
    /// 3. Reset removed procedures → Created (R7)
    /// 4. Set added procedures → Reconciled (R8)
    /// 5. Recalculate total_amount (R4)
    /// 6. Update the group
    /// 7. Publish events
    pub async fn update_group(
        &self,
        group_id: String,
        payment_date: String,
        new_procedure_ids: Vec<String>,
    ) -> anyhow::Result<FundPaymentGroup> {
        tracing::info!(
            target: BACKEND,
            group_id = %group_id,
            payment_date = %payment_date,
            procedure_count = new_procedure_ids.len(),
            "Updating manual fund payment group"
        );

        // Step 1: Load existing group
        let group = self
            .fund_payment_service
            .read_group(&group_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Fund payment group not found: {}", group_id))?;

        let old_procedure_ids: Vec<String> =
            group.lines.iter().map(|l| l.procedure_id.clone()).collect();

        // Step 1b: R9 — reject if any procedure is bank-reconciled
        let existing_procedures = self
            .procedure_service
            .read_procedures_by_ids(old_procedure_ids.clone())
            .await?;

        let is_locked = existing_procedures.iter().any(|p| {
            matches!(
                p.payment_status,
                ProcedureStatus::FundPaid | ProcedureStatus::PartiallyFundPaid
            )
        });

        if is_locked {
            anyhow::bail!(
                "Cannot modify fund payment group {}: it contains bank-reconciled procedures",
                group_id
            );
        }

        // Step 2: Detect removed and added procedure IDs
        let old_set: std::collections::HashSet<String> = old_procedure_ids.into_iter().collect();
        let new_set: std::collections::HashSet<String> =
            new_procedure_ids.iter().cloned().collect();

        let removed_ids: Vec<String> = old_set.difference(&new_set).cloned().collect();
        let added_ids: Vec<String> = new_set.difference(&old_set).cloned().collect();

        // Step 3: Reset removed procedures → Created (R7)
        if !removed_ids.is_empty() {
            let removed_procedures = self
                .procedure_service
                .read_procedures_by_ids(removed_ids.clone())
                .await?;

            let reset: Vec<_> = removed_procedures
                .into_iter()
                .map(|mut p| {
                    p.payment_status = ProcedureStatus::Created;
                    p.confirmed_payment_date = None;
                    p.paid_amount = None;
                    p
                })
                .collect();

            self.procedure_service
                .update_procedures_batch(reset, true)
                .await?;

            tracing::debug!(
                target: BACKEND,
                count = removed_ids.len(),
                "Reset removed procedures to Created"
            );
        }

        // Step 4: Set added procedures → Reconciled (R8)
        if !added_ids.is_empty() {
            let parsed_payment_date = NaiveDate::parse_from_str(&payment_date, "%Y-%m-%d")
                .map_err(|_| {
                    anyhow::anyhow!(
                        "Invalid payment date format: {} (expected YYYY-MM-DD)",
                        payment_date
                    )
                })?;

            let added_procedures = self
                .procedure_service
                .read_procedures_by_ids(added_ids.clone())
                .await?;

            let reconciled: Vec<_> = added_procedures
                .into_iter()
                .map(|mut p| {
                    p.payment_status = ProcedureStatus::Reconciled;
                    p.confirmed_payment_date = Some(parsed_payment_date);
                    p.paid_amount = p.billed_amount;
                    p
                })
                .collect();

            self.procedure_service
                .update_procedures_batch(reconciled, true)
                .await?;

            tracing::debug!(
                target: BACKEND,
                count = added_ids.len(),
                "Set added procedures to Reconciled"
            );
        }

        // Step 5: Recalculate total_amount from final procedure list (R4)
        let final_procedures = self
            .procedure_service
            .read_procedures_by_ids(new_procedure_ids.clone())
            .await?;

        let total_amount: i64 = final_procedures
            .iter()
            .map(|p| p.billed_amount.unwrap_or(0))
            .sum();

        // Step 6: Update the group
        let updated_group = self
            .fund_payment_service
            .update_group(
                group_id.clone(),
                payment_date,
                new_procedure_ids,
                total_amount,
            )
            .await?;

        tracing::info!(
            target: BACKEND,
            group_id = %group_id,
            total_amount,
            removed = removed_ids.len(),
            added = added_ids.len(),
            "Manual fund payment group updated"
        );

        // Step 7: Publish events
        let _ = self.event_bus.publish::<ProcedureUpdated>(ProcedureUpdated);
        let _ = self
            .event_bus
            .publish::<FundPaymentGroupUpdated>(FundPaymentGroupUpdated);

        Ok(updated_group)
    }

    /// Delete a fund payment group and clean up associated procedures
    ///
    /// Steps:
    /// 1. Read the group to get its lines (procedure IDs)
    /// 2. Reject if any linked procedure is bank-reconciled (R9)
    /// 3. Reset each procedure: status → Created, clear confirmed_payment_date, clear paid_amount
    /// 4. Soft-delete the lines and the group
    pub async fn delete_group_with_cleanup(&self, group_id: &str) -> anyhow::Result<()> {
        tracing::info!(target: BACKEND, group_id = %group_id, "Deleting fund payment group with procedure cleanup");

        // Step 1: Read group to get procedure IDs from lines
        let group = self
            .fund_payment_service
            .read_group(group_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Fund payment group not found: {}", group_id))?;

        let procedure_ids: Vec<String> =
            group.lines.iter().map(|l| l.procedure_id.clone()).collect();
        let procedure_count = procedure_ids.len();

        // R9 + Step 2: Single read reused for both lock check and reset
        let procedures = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids)
            .await?;

        let is_locked = procedures.iter().any(|p| {
            matches!(
                p.payment_status,
                ProcedureStatus::FundPaid | ProcedureStatus::PartiallyFundPaid
            )
        });

        if is_locked {
            anyhow::bail!(
                "Cannot delete fund payment group {}: it contains bank-reconciled procedures",
                group_id
            );
        }

        // Step 3: Reset reconciliation data in a single batch transaction
        let procedures_to_reset: Vec<_> = procedures
            .into_iter()
            .map(|mut p| {
                p.payment_status = ProcedureStatus::Created;
                p.confirmed_payment_date = None;
                p.paid_amount = None;
                p
            })
            .collect();

        if !procedures_to_reset.is_empty() {
            self.procedure_service
                .update_procedures_batch(procedures_to_reset, false)
                .await?;
        }

        // Step 4: Soft-delete lines and group
        self.fund_payment_service
            .delete_lines_by_group(group_id)
            .await?;
        self.fund_payment_service
            .delete_group(group_id.to_string())
            .await?;

        tracing::info!(
            target: BACKEND,
            group_id = %group_id,
            procedure_count,
            "Fund payment group deleted with procedure cleanup complete"
        );

        Ok(())
    }

    /// Returns the data needed to edit a fund payment group:
    /// - `current_procedures`: procedures currently in the group (Reconciled/PartiallyReconciled)
    /// - `available_procedures`: Created procedures for the same fund, not already in the group
    ///
    /// Centralises the classification logic server-side so the frontend only handles display.
    pub async fn get_group_edit_data(
        &self,
        group_id: &str,
        fund_id: &str,
    ) -> anyhow::Result<(Vec<Procedure>, Vec<Procedure>)> {
        tracing::debug!(
            target: BACKEND,
            group_id = %group_id,
            fund_id = %fund_id,
            "Fetching fund payment group edit data"
        );

        // Step 1: Fetch current procedures in the group
        let group = self
            .fund_payment_service
            .read_group(group_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Fund payment group not found: {}", group_id))?;

        let procedure_ids: Vec<String> =
            group.lines.iter().map(|l| l.procedure_id.clone()).collect();

        let current_procedures = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids.clone())
            .await?;

        // Step 2: Fetch Created procedures for this fund with date <= group payment_date (R19)
        let current_ids: std::collections::HashSet<String> = procedure_ids.into_iter().collect();
        let payment_date_str = group.payment_date.format("%Y-%m-%d").to_string();

        let available_procedures: Vec<Procedure> = self
            .procedure_service
            .find_created_by_fund_before_date(fund_id, &payment_date_str)
            .await?
            .into_iter()
            .filter(|p| !current_ids.contains(&p.id))
            .collect();

        tracing::info!(
            target: BACKEND,
            group_id = %group_id,
            current_count = current_procedures.len(),
            available_count = available_procedures.len(),
            "Fund payment group edit data fetched"
        );

        Ok((current_procedures, available_procedures))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::context::fund::MockFundPaymentRepository;
    use crate::context::procedure::{MockProcedureRepository, ProcedureRepository};

    /// Build an orchestrator wired with two repository mocks. Each test
    /// configures only the methods it expects to hit — mockall panics on any
    /// unconfigured call, which keeps the contract between orchestrator and
    /// repositories explicit.
    fn make_orchestrator(
        fund_payment_repo: MockFundPaymentRepository,
        procedure_repo: MockProcedureRepository,
    ) -> FundPaymentManualManagementOrchestrator {
        let bus = Arc::new(EventBus::new());
        let fund_payment_service = Arc::new(FundPaymentService::new(
            Arc::new(fund_payment_repo),
            bus.clone(),
        ));
        let procedure_repo_arc: Arc<dyn ProcedureRepository> = Arc::new(procedure_repo);
        let procedure_service = Arc::new(ProcedureService::new(procedure_repo_arc, bus.clone()));
        FundPaymentManualManagementOrchestrator::new(procedure_service, fund_payment_service, bus)
    }

    /// `get_group_edit_data` surfaces a domain error (not a panic) when the
    /// group does not exist.
    #[tokio::test]
    async fn get_group_edit_data_not_found_returns_error() {
        let mut fund_payment_repo = MockFundPaymentRepository::new();
        fund_payment_repo
            .expect_read_group()
            .returning(|_| Ok(None));

        let orchestrator = make_orchestrator(fund_payment_repo, MockProcedureRepository::new());
        let result = orchestrator
            .get_group_edit_data("nonexistent-group", "nonexistent-fund")
            .await;
        assert!(
            result.is_err(),
            "expected Err for nonexistent group, got: {:?}",
            result.as_ref().ok()
        );
    }

    /// `update_group` surfaces a domain error (not a panic) when the group
    /// does not exist.
    #[tokio::test]
    async fn update_group_not_found_returns_error() {
        let mut fund_payment_repo = MockFundPaymentRepository::new();
        fund_payment_repo
            .expect_read_group()
            .returning(|_| Ok(None));

        let orchestrator = make_orchestrator(fund_payment_repo, MockProcedureRepository::new());
        let result = orchestrator
            .update_group(
                "nonexistent-group".to_string(),
                "2026-01-15".to_string(),
                vec![],
            )
            .await;
        assert!(
            result.is_err(),
            "expected Err for nonexistent group, got: {:?}",
            result.as_ref().ok()
        );
    }
}
