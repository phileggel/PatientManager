use std::sync::Arc;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::context::bank::{BankTransferLinkRepository, BankTransferService, BankTransferType};
use crate::context::fund::{FundPaymentGroup, FundPaymentGroupStatus, FundPaymentService};
use crate::context::procedure::{PaymentMethod, Procedure, ProcedureService, ProcedureStatus};

/// Number of days before the transfer/payment date within which to search for eligible items (R6, R14).
const WINDOW_DAYS: i64 = 7;

/// Sentinel dates for "all dates" range (used by the expanded search, R12/R20).
const ALL_DATES_MIN: &str = "0001-01-01";
const ALL_DATES_MAX: &str = "9999-12-31";

/// A fund payment group candidate for a FUND transfer (R6)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundGroupCandidate {
    pub group_id: String,
    pub fund_id: String,
    pub payment_date: String,
    pub total_amount: i64,
}

/// A procedure candidate for a direct payment (R14)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DirectPaymentProcedureCandidate {
    pub procedure_id: String,
    pub patient_id: String,
    pub procedure_date: String,
    pub procedure_amount: Option<i64>,
}

/// Result of creating a bank transfer with links
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BankManualMatchResult {
    pub transfer_id: String,
    pub linked_count: usize,
}

pub struct BankManualMatchOrchestrator {
    bank_transfer_service: Arc<BankTransferService>,
    transfer_link_repo: Arc<dyn BankTransferLinkRepository>,
    fund_payment_service: Arc<FundPaymentService>,
    procedure_service: Arc<ProcedureService>,
}

impl BankManualMatchOrchestrator {
    pub fn new(
        bank_transfer_service: Arc<BankTransferService>,
        transfer_link_repo: Arc<dyn BankTransferLinkRepository>,
        fund_payment_service: Arc<FundPaymentService>,
        procedure_service: Arc<ProcedureService>,
    ) -> Self {
        Self {
            bank_transfer_service,
            transfer_link_repo,
            fund_payment_service,
            procedure_service,
        }
    }

    // ======================================================================
    // FUND transfers
    // ======================================================================

    /// R6 — Return Active fund payment groups whose payment_date is in
    /// [transfer_date - WINDOW_DAYS, transfer_date].
    pub async fn get_unsettled_fund_groups(
        &self,
        transfer_date: &str,
    ) -> anyhow::Result<Vec<FundGroupCandidate>> {
        let date = parse_date(transfer_date)?;
        let date_min = date - chrono::Duration::days(WINDOW_DAYS);

        let groups = self.fund_payment_service.read_all_groups().await?;
        let candidates = groups
            .into_iter()
            .filter(|g| !g.is_locked && g.payment_date >= date_min && g.payment_date <= date)
            .map(group_to_candidate)
            .collect();

        Ok(candidates)
    }

    /// R12 — All Active groups, no date constraint (expanded search).
    pub async fn get_all_unsettled_fund_groups(&self) -> anyhow::Result<Vec<FundGroupCandidate>> {
        let groups = self.fund_payment_service.read_all_groups().await?;
        Ok(groups
            .into_iter()
            .filter(|g| !g.is_locked)
            .map(group_to_candidate)
            .collect())
    }

    /// R7 — Create a FUND bank transfer, link it to the selected groups,
    /// update procedure statuses and group statuses (BankPayed).
    pub async fn create_fund_transfer(
        &self,
        bank_account_id: String,
        transfer_date: String,
        group_ids: Vec<String>,
    ) -> anyhow::Result<BankManualMatchResult> {
        // Compute total amount from groups
        let total_amount = self.compute_fund_groups_amount(&group_ids).await?;

        let transfer = self
            .bank_transfer_service
            .create_transfer(
                transfer_date.clone(),
                total_amount,
                BankTransferType::Fund,
                bank_account_id,
                false,
            )
            .await?;

        self.transfer_link_repo
            .link_fund_groups(&transfer.id, &group_ids)
            .await?;

        let confirmed_date = parse_date(&transfer_date)?;

        // Update each group: procedures → FundPayed/PartiallyFundPayed, group → BankPayed
        for group_id in &group_ids {
            self.apply_fund_transfer_to_group(group_id, confirmed_date)
                .await?;
        }

        Ok(BankManualMatchResult {
            transfer_id: transfer.id,
            linked_count: group_ids.len(),
        })
    }

    /// R9 — Update a FUND transfer: change date and/or groups.
    /// Reverts old groups (Active), applies new groups (BankPayed).
    pub async fn update_fund_transfer(
        &self,
        transfer_id: String,
        new_transfer_date: String,
        new_group_ids: Vec<String>,
    ) -> anyhow::Result<BankManualMatchResult> {
        // R4 — Immutable type guard: must be a FUND transfer (checked before any mutation).
        let transfer = self
            .bank_transfer_service
            .read_transfer(&transfer_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Transfer not found: {}", transfer_id))?;
        anyhow::ensure!(
            transfer.transfer_type == BankTransferType::Fund,
            "R4: transfer {} has type {:?}, not FUND — use update_direct_transfer instead",
            transfer_id,
            transfer.transfer_type
        );

        // Revert old groups
        let old_group_ids = self
            .transfer_link_repo
            .get_fund_group_ids(&transfer_id)
            .await?;
        for group_id in &old_group_ids {
            self.revert_fund_transfer_from_group(group_id).await?;
        }

        // Update transfer date and amount
        let total_amount = self.compute_fund_groups_amount(&new_group_ids).await?;
        let confirmed_date = parse_date(&new_transfer_date)?;

        let updated = crate::context::bank::BankTransfer::with_id(
            transfer.id.clone(),
            new_transfer_date.clone(),
            total_amount,
            BankTransferType::Fund,
            transfer.bank_account,
        )?;
        self.bank_transfer_service.update_transfer(updated).await?;

        // Update links
        self.transfer_link_repo
            .unlink_all_fund_groups(&transfer_id)
            .await?;
        self.transfer_link_repo
            .link_fund_groups(&transfer_id, &new_group_ids)
            .await?;

        // Apply new groups
        for group_id in &new_group_ids {
            self.apply_fund_transfer_to_group(group_id, confirmed_date)
                .await?;
        }

        Ok(BankManualMatchResult {
            transfer_id,
            linked_count: new_group_ids.len(),
        })
    }

    /// R8 — Delete a FUND transfer: hard-delete transfer, revert all linked groups (Active).
    pub async fn delete_fund_transfer(&self, transfer_id: String) -> anyhow::Result<()> {
        // R4 — Immutable type guard (guard only — transfer not reused after this check).
        let transfer_type = self
            .bank_transfer_service
            .read_transfer(&transfer_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Transfer not found: {}", transfer_id))?
            .transfer_type;
        anyhow::ensure!(
            transfer_type == BankTransferType::Fund,
            "R4: transfer {} has type {:?}, not FUND — use delete_direct_transfer instead",
            transfer_id,
            transfer_type
        );

        let group_ids = self
            .transfer_link_repo
            .get_fund_group_ids(&transfer_id)
            .await?;

        // Revert all linked groups before deleting
        for group_id in &group_ids {
            self.revert_fund_transfer_from_group(group_id).await?;
        }

        // Remove links then hard-delete the transfer
        self.transfer_link_repo
            .unlink_all_fund_groups(&transfer_id)
            .await?;
        self.bank_transfer_service
            .delete_transfer(&transfer_id)
            .await?;

        Ok(())
    }

    // ======================================================================
    // Direct payments (CHECK / CREDIT_CARD / CASH)
    // ======================================================================

    /// R14 — Return procedures with status CREATED and procedure_date in
    /// [payment_date - WINDOW_DAYS, payment_date].
    pub async fn get_eligible_procedures_for_direct_payment(
        &self,
        payment_date: &str,
    ) -> anyhow::Result<Vec<DirectPaymentProcedureCandidate>> {
        let date = parse_date(payment_date)?;
        let date_min = (date - chrono::Duration::days(WINDOW_DAYS))
            .format("%Y-%m-%d")
            .to_string();
        let date_max = date.format("%Y-%m-%d").to_string();

        let procedures = self
            .procedure_service
            .find_created_in_date_range(&date_min, &date_max)
            .await?;

        Ok(procedures.into_iter().map(procedure_to_candidate).collect())
    }

    /// R20 — All CREATED procedures, no date constraint (expanded search).
    /// Returns all procedures with status Created, sorted by procedure_date DESC.
    pub async fn get_all_eligible_procedures_for_direct_payment(
        &self,
    ) -> anyhow::Result<Vec<DirectPaymentProcedureCandidate>> {
        let procedures = self
            .procedure_service
            .find_created_in_date_range(ALL_DATES_MIN, ALL_DATES_MAX)
            .await?;

        Ok(procedures.into_iter().map(procedure_to_candidate).collect())
    }

    /// R15 — Create a direct payment transfer, link it to selected procedures,
    /// update procedure statuses to DirectlyPayed.
    pub async fn create_direct_transfer(
        &self,
        bank_account_id: String,
        transfer_date: String,
        transfer_type: BankTransferType,
        procedure_ids: Vec<String>,
    ) -> anyhow::Result<BankManualMatchResult> {
        let total_amount = self.compute_procedures_amount(&procedure_ids).await?;

        let transfer = self
            .bank_transfer_service
            .create_transfer(
                transfer_date.clone(),
                total_amount,
                transfer_type,
                bank_account_id,
                false,
            )
            .await?;

        self.transfer_link_repo
            .link_procedures(&transfer.id, &procedure_ids)
            .await?;

        let confirmed_date = parse_date(&transfer_date)?;
        let payment_method = transfer_type_to_payment_method(transfer_type);

        self.apply_direct_payment_to_procedures(&procedure_ids, payment_method, confirmed_date)
            .await?;

        Ok(BankManualMatchResult {
            transfer_id: transfer.id,
            linked_count: procedure_ids.len(),
        })
    }

    /// R17 — Update a direct transfer: change date and/or procedures.
    pub async fn update_direct_transfer(
        &self,
        transfer_id: String,
        new_transfer_date: String,
        new_procedure_ids: Vec<String>,
    ) -> anyhow::Result<BankManualMatchResult> {
        // R4 — Immutable type guard: must not be a FUND transfer (checked before any mutation).
        let transfer = self
            .bank_transfer_service
            .read_transfer(&transfer_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Transfer not found: {}", transfer_id))?;
        anyhow::ensure!(
            transfer.transfer_type != BankTransferType::Fund,
            "R4: transfer {} is a FUND transfer — use update_fund_transfer instead",
            transfer_id
        );

        // Revert old procedures
        let old_procedure_ids = self
            .transfer_link_repo
            .get_procedure_ids(&transfer_id)
            .await?;
        self.revert_direct_payment_from_procedures(&old_procedure_ids)
            .await?;

        // Update transfer amount and date
        let total_amount = self.compute_procedures_amount(&new_procedure_ids).await?;
        let transfer_type = transfer.transfer_type;
        let confirmed_date = parse_date(&new_transfer_date)?;
        let payment_method = transfer_type_to_payment_method(transfer_type);

        let updated = crate::context::bank::BankTransfer::with_id(
            transfer.id.clone(),
            new_transfer_date,
            total_amount,
            transfer_type,
            transfer.bank_account,
        )?;
        self.bank_transfer_service.update_transfer(updated).await?;

        // Update links
        self.transfer_link_repo
            .unlink_all_procedures(&transfer_id)
            .await?;
        self.transfer_link_repo
            .link_procedures(&transfer_id, &new_procedure_ids)
            .await?;

        // Apply new procedures
        self.apply_direct_payment_to_procedures(&new_procedure_ids, payment_method, confirmed_date)
            .await?;

        Ok(BankManualMatchResult {
            transfer_id,
            linked_count: new_procedure_ids.len(),
        })
    }

    /// R16 — Delete a direct transfer: hard-delete, revert all linked procedures to Created.
    pub async fn delete_direct_transfer(&self, transfer_id: String) -> anyhow::Result<()> {
        // R4 — Immutable type guard (guard only — transfer not reused after this check).
        let transfer_type = self
            .bank_transfer_service
            .read_transfer(&transfer_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Transfer not found: {}", transfer_id))?
            .transfer_type;
        anyhow::ensure!(
            transfer_type != BankTransferType::Fund,
            "R4: transfer {} is a FUND transfer — use delete_fund_transfer instead",
            transfer_id
        );

        let procedure_ids = self
            .transfer_link_repo
            .get_procedure_ids(&transfer_id)
            .await?;

        self.revert_direct_payment_from_procedures(&procedure_ids)
            .await?;

        self.transfer_link_repo
            .unlink_all_procedures(&transfer_id)
            .await?;
        self.bank_transfer_service
            .delete_transfer(&transfer_id)
            .await?;

        Ok(())
    }

    // ======================================================================
    // Read helpers (for the frontend to display linked entities)
    // ======================================================================

    pub async fn get_transfer_fund_group_ids(
        &self,
        transfer_id: &str,
    ) -> anyhow::Result<Vec<String>> {
        self.transfer_link_repo
            .get_fund_group_ids(transfer_id)
            .await
    }

    pub async fn get_transfer_procedure_ids(
        &self,
        transfer_id: &str,
    ) -> anyhow::Result<Vec<String>> {
        self.transfer_link_repo.get_procedure_ids(transfer_id).await
    }

    /// R21 — Fetch fund group candidates by IDs for the edit modal.
    /// Groups are BankPayed at this point and won't appear in get_unsettled_fund_groups.
    pub async fn get_fund_groups_by_ids(
        &self,
        group_ids: Vec<String>,
    ) -> anyhow::Result<Vec<FundGroupCandidate>> {
        let mut candidates = Vec::new();
        for group_id in &group_ids {
            match self.fund_payment_service.read_group(group_id).await? {
                Some(group) => candidates.push(group_to_candidate(group)),
                None => tracing::warn!("Fund group not found for edit pre-fill: {}", group_id),
            }
        }
        Ok(candidates)
    }

    /// R21 — Fetch procedure candidates by IDs for the edit modal.
    /// Procedures are DirectlyPayed at this point and won't appear in get_eligible_procedures_for_direct_payment.
    pub async fn get_procedures_by_ids(
        &self,
        procedure_ids: Vec<String>,
    ) -> anyhow::Result<Vec<DirectPaymentProcedureCandidate>> {
        let procedures = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids)
            .await?;
        Ok(procedures.into_iter().map(procedure_to_candidate).collect())
    }

    // ======================================================================
    // Private helpers
    // ======================================================================

    async fn compute_fund_groups_amount(&self, group_ids: &[String]) -> anyhow::Result<i64> {
        let mut total = 0i64;
        for group_id in group_ids {
            let group = self
                .fund_payment_service
                .read_group(group_id)
                .await?
                .ok_or_else(|| anyhow::anyhow!("Fund payment group not found: {}", group_id))?;
            total += group.total_amount;
        }
        anyhow::ensure!(total > 0, "Total amount must be greater than 0");
        Ok(total)
    }

    async fn compute_procedures_amount(&self, procedure_ids: &[String]) -> anyhow::Result<i64> {
        let procedures = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids.to_vec())
            .await?;
        let total: i64 = procedures
            .iter()
            .map(|p| p.procedure_amount.unwrap_or(0))
            .sum();
        anyhow::ensure!(total > 0, "Total amount must be greater than 0");
        Ok(total)
    }

    /// R7 — Transition procedures of a group to FundPayed/PartiallyFundPayed
    /// and set the group status to BankPayed.
    async fn apply_fund_transfer_to_group(
        &self,
        group_id: &str,
        confirmed_date: NaiveDate,
    ) -> anyhow::Result<()> {
        if let Some(group) = self.fund_payment_service.read_group(group_id).await? {
            let procedure_ids: Vec<String> =
                group.lines.iter().map(|l| l.procedure_id.clone()).collect();

            let procedures = self
                .procedure_service
                .read_procedures_by_ids(procedure_ids)
                .await?;

            let updated: Vec<Procedure> = procedures
                .into_iter()
                .map(|mut p| {
                    let new_status = if p.payment_status == ProcedureStatus::PartiallyReconciled {
                        ProcedureStatus::PartiallyFundPayed
                    } else {
                        ProcedureStatus::FundPayed
                    };
                    p.payment_status = new_status;
                    // actual_payment_amount is conserved (R7 spec)
                    let amount = p.actual_payment_amount;
                    p.with_payment_info(PaymentMethod::BankTransfer, Some(confirmed_date), amount)
                })
                .collect();

            self.procedure_service
                .update_procedures_batch(updated, false)
                .await?;
        }

        self.fund_payment_service
            .update_group_status(group_id, FundPaymentGroupStatus::BankPayed)
            .await?;

        Ok(())
    }

    /// R8 — Revert procedures of a group to Reconciliated/PartiallyReconciled
    /// and set the group status back to Active.
    async fn revert_fund_transfer_from_group(&self, group_id: &str) -> anyhow::Result<()> {
        if let Some(group) = self.fund_payment_service.read_group(group_id).await? {
            let procedure_ids: Vec<String> =
                group.lines.iter().map(|l| l.procedure_id.clone()).collect();

            let procedures = self
                .procedure_service
                .read_procedures_by_ids(procedure_ids)
                .await?;

            let updated: Vec<Procedure> = procedures
                .into_iter()
                .map(|mut p| {
                    p.payment_status = match p.payment_status {
                        ProcedureStatus::FundPayed => ProcedureStatus::Reconciliated,
                        ProcedureStatus::PartiallyFundPayed => ProcedureStatus::PartiallyReconciled,
                        other => other, // Unexpected — leave as-is
                    };
                    // Restore confirmed_payment_date to group payment_date, clear payment_method (R8)
                    // actual_payment_amount is conserved (R8 spec: "conservé")
                    p.revert_fund_payment(group.payment_date)
                })
                .collect();

            self.procedure_service
                .update_procedures_batch(updated, false)
                .await?;
        }

        self.fund_payment_service
            .update_group_status(group_id, FundPaymentGroupStatus::Active)
            .await?;

        Ok(())
    }

    /// R15 — Set procedures to DirectlyPayed with payment info.
    async fn apply_direct_payment_to_procedures(
        &self,
        procedure_ids: &[String],
        payment_method: PaymentMethod,
        confirmed_date: NaiveDate,
    ) -> anyhow::Result<()> {
        let procedures = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids.to_vec())
            .await?;

        let updated: Vec<Procedure> = procedures
            .into_iter()
            .map(|mut p| {
                p.payment_status = ProcedureStatus::DirectlyPayed;
                let amount = p.procedure_amount;
                p.with_payment_info(payment_method, Some(confirmed_date), amount)
            })
            .collect();

        self.procedure_service
            .update_procedures_batch(updated, false)
            .await?;

        Ok(())
    }

    /// R16 — Revert procedures to Created status, clear payment info.
    async fn revert_direct_payment_from_procedures(
        &self,
        procedure_ids: &[String],
    ) -> anyhow::Result<()> {
        let procedures = self
            .procedure_service
            .read_procedures_by_ids(procedure_ids.to_vec())
            .await?;

        let updated: Vec<Procedure> = procedures
            .into_iter()
            .map(|mut p| {
                p.payment_status = ProcedureStatus::Created;
                p.clear_payment_info()
            })
            .collect();

        self.procedure_service
            .update_procedures_batch(updated, false)
            .await?;

        Ok(())
    }
}

// ======================================================================
// Pure conversion helpers (testable)
// ======================================================================

fn parse_date(s: &str) -> anyhow::Result<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|_| anyhow::anyhow!("Invalid date format: {} (expected YYYY-MM-DD)", s))
}

fn group_to_candidate(g: FundPaymentGroup) -> FundGroupCandidate {
    FundGroupCandidate {
        group_id: g.id,
        fund_id: g.fund_id,
        payment_date: g.payment_date.format("%Y-%m-%d").to_string(),
        total_amount: g.total_amount,
    }
}

fn procedure_to_candidate(p: Procedure) -> DirectPaymentProcedureCandidate {
    DirectPaymentProcedureCandidate {
        procedure_id: p.id,
        patient_id: p.patient_id,
        procedure_date: p.procedure_date.format("%Y-%m-%d").to_string(),
        procedure_amount: p.procedure_amount,
    }
}

fn transfer_type_to_payment_method(t: BankTransferType) -> PaymentMethod {
    match t {
        BankTransferType::Check => PaymentMethod::Check,
        BankTransferType::CreditCard => PaymentMethod::BankCard,
        BankTransferType::Cash => PaymentMethod::Cash,
        BankTransferType::Fund => PaymentMethod::BankTransfer,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_window_days_boundary() {
        let transfer_date = NaiveDate::from_ymd_opt(2026, 3, 15).unwrap();
        let date_min = transfer_date - chrono::Duration::days(WINDOW_DAYS);
        // A group on March 8 is exactly 7 days before March 15 → eligible
        let group_date_boundary = NaiveDate::from_ymd_opt(2026, 3, 8).unwrap();
        // A group on March 7 is 8 days before → NOT eligible
        let group_date_out = NaiveDate::from_ymd_opt(2026, 3, 7).unwrap();

        assert!(group_date_boundary >= date_min);
        assert!(group_date_out < date_min);
    }

    // ======================================================================
    // Integration tests (in-memory SQLite + real migrations)
    // ======================================================================

    use std::sync::Arc;

    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::SqlitePool;
    use uuid::Uuid;

    use crate::context::bank::{
        BankTransferService, BankTransferType, SqliteBankAccountRepository,
        SqliteBankTransferLinkRepository, SqliteBankTransferRepository,
    };
    use crate::context::fund::{
        FundPaymentGroupStatus, FundPaymentService, SqliteFundPaymentRepository,
    };
    use crate::context::procedure::{ProcedureService, ProcedureStatus, SqliteProcedureRepository};
    use crate::core::event_bus::EventBus;

    async fn setup_db() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to connect");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Migrations failed");
        pool
    }

    /// Build orchestrator + hold service handles for post-condition queries.
    fn make_components(
        pool: &SqlitePool,
    ) -> (
        BankManualMatchOrchestrator,
        Arc<FundPaymentService>,
        Arc<ProcedureService>,
    ) {
        let event_bus = Arc::new(EventBus::new());
        let fund_svc = Arc::new(FundPaymentService::new(
            Arc::new(SqliteFundPaymentRepository::new(pool.clone())),
            event_bus.clone(),
        ));
        let proc_svc = Arc::new(ProcedureService::new(
            Arc::new(SqliteProcedureRepository::new(pool.clone())),
            event_bus.clone(),
        ));
        let bank_svc = Arc::new(BankTransferService::new(
            Arc::new(SqliteBankTransferRepository::new(pool.clone())),
            Arc::new(SqliteBankAccountRepository::new(pool.clone())),
            event_bus.clone(),
        ));
        let link_repo = Arc::new(SqliteBankTransferLinkRepository::new(pool.clone()));
        let orchestrator = BankManualMatchOrchestrator::new(
            bank_svc,
            link_repo,
            fund_svc.clone(),
            proc_svc.clone(),
        );
        (orchestrator, fund_svc, proc_svc)
    }

    /// Seed patient, fund, and procedure_type; returns (patient_id, fund_id, proc_type_id).
    async fn seed_base(pool: &SqlitePool) -> (String, String, String) {
        let patient_id = Uuid::new_v4().to_string();
        let fund_id = Uuid::new_v4().to_string();
        let proc_type_id = Uuid::new_v4().to_string();

        sqlx::query("INSERT INTO patient (id, is_anonymous, is_deleted) VALUES (?, 0, 0)")
            .bind(&patient_id)
            .execute(pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES (?, 'CPAM93', 'CPAM 93', 0)",
        )
        .bind(&fund_id)
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO procedure_type (id, name, default_amount, is_deleted) VALUES (?, 'Consultation', 100000, 0)",
        )
        .bind(&proc_type_id)
        .execute(pool)
        .await
        .unwrap();

        (patient_id, fund_id, proc_type_id)
    }

    async fn seed_procedure(
        pool: &SqlitePool,
        patient_id: &str,
        proc_type_id: &str,
        procedure_date: &str,
        status: &str,
        amount: i64,
    ) -> String {
        let proc_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO "procedure" (id, patient_id, procedure_type_id, procedure_date,
               procedure_amount, payment_status, is_deleted) VALUES (?, ?, ?, ?, ?, ?, 0)"#,
        )
        .bind(&proc_id)
        .bind(patient_id)
        .bind(proc_type_id)
        .bind(procedure_date)
        .bind(amount)
        .bind(status)
        .execute(pool)
        .await
        .unwrap();
        proc_id
    }

    async fn seed_fund_group(
        pool: &SqlitePool,
        fund_id: &str,
        payment_date: &str,
        total_amount: i64,
        proc_ids: &[String],
        status: &str,
    ) -> String {
        let group_id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted)
             VALUES (?, ?, ?, ?, ?, 0)",
        )
        .bind(&group_id)
        .bind(fund_id)
        .bind(payment_date)
        .bind(total_amount)
        .bind(status)
        .execute(pool)
        .await
        .unwrap();

        for proc_id in proc_ids {
            let line_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO fund_payment_line (id, fund_payment_group_id, procedure_id, is_deleted)
                 VALUES (?, ?, ?, 0)",
            )
            .bind(&line_id)
            .bind(&group_id)
            .bind(proc_id)
            .execute(pool)
            .await
            .unwrap();
        }

        group_id
    }

    /// R6 — Only Active groups within the 7-day window are returned.
    #[tokio::test]
    async fn test_get_unsettled_fund_groups_respects_7_day_window() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, fund_id, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, _, _) = make_components(&pool);

        // Exactly at the window boundary (7 days before 2026-03-15) → included
        let p1 = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-08",
            "RECONCILIATED",
            100_000,
        )
        .await;
        let group_in =
            seed_fund_group(&pool, &fund_id, "2026-03-08", 100_000, &[p1], "ACTIVE").await;

        // One day outside the window (8 days before) → excluded
        let p2 = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-07",
            "RECONCILIATED",
            100_000,
        )
        .await;
        let group_out =
            seed_fund_group(&pool, &fund_id, "2026-03-07", 100_000, &[p2], "ACTIVE").await;

        // Within window but already BankPayed (locked) → excluded
        let p3 = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-12",
            "FUND_PAYED",
            100_000,
        )
        .await;
        let group_locked =
            seed_fund_group(&pool, &fund_id, "2026-03-12", 100_000, &[p3], "BANK_PAYED").await;

        let candidates = orchestrator.get_unsettled_fund_groups("2026-03-15").await?;
        let ids: Vec<&str> = candidates.iter().map(|c| c.group_id.as_str()).collect();

        assert_eq!(candidates.len(), 1, "Only one group should be returned");
        assert!(
            ids.contains(&group_in.as_str()),
            "Group at boundary should be included"
        );
        assert!(
            !ids.contains(&group_out.as_str()),
            "Group outside window should be excluded"
        );
        assert!(
            !ids.contains(&group_locked.as_str()),
            "BankPayed group should be excluded"
        );

        Ok(())
    }

    /// R7 — Creating a FUND transfer marks the group BankPayed and procedures FundPayed.
    #[tokio::test]
    async fn test_create_fund_transfer_sets_bank_payed_status() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, fund_id, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, fund_svc, proc_svc) = make_components(&pool);

        let proc_id = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "RECONCILIATED",
            150_000,
        )
        .await;
        let group_id = seed_fund_group(
            &pool,
            &fund_id,
            "2026-03-10",
            150_000,
            std::slice::from_ref(&proc_id),
            "ACTIVE",
        )
        .await;

        let result = orchestrator
            .create_fund_transfer(
                "cash-account-default".to_string(),
                "2026-03-15".to_string(),
                vec![group_id.clone()],
            )
            .await?;

        assert_eq!(result.linked_count, 1);

        let group = fund_svc.read_group(&group_id).await?.unwrap();
        assert_eq!(group.status, FundPaymentGroupStatus::BankPayed);
        assert!(group.is_locked);

        let procedure = proc_svc.read_procedure(&proc_id).await?.unwrap();
        assert_eq!(procedure.payment_status, ProcedureStatus::FundPayed);
        assert_eq!(
            procedure.confirmed_payment_date,
            NaiveDate::from_ymd_opt(2026, 3, 15)
        );

        Ok(())
    }

    /// R8 — Deleting a FUND transfer reverts the group to Active and procedures to Reconciliated.
    #[tokio::test]
    async fn test_delete_fund_transfer_reverts_group_to_active() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, fund_id, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, fund_svc, proc_svc) = make_components(&pool);

        let proc_id = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "RECONCILIATED",
            150_000,
        )
        .await;
        let group_id = seed_fund_group(
            &pool,
            &fund_id,
            "2026-03-10",
            150_000,
            std::slice::from_ref(&proc_id),
            "ACTIVE",
        )
        .await;

        let result = orchestrator
            .create_fund_transfer(
                "cash-account-default".to_string(),
                "2026-03-15".to_string(),
                vec![group_id.clone()],
            )
            .await?;

        orchestrator
            .delete_fund_transfer(result.transfer_id)
            .await?;

        let group = fund_svc.read_group(&group_id).await?.unwrap();
        assert_eq!(group.status, FundPaymentGroupStatus::Active);
        assert!(!group.is_locked);

        let procedure = proc_svc.read_procedure(&proc_id).await?.unwrap();
        assert_eq!(procedure.payment_status, ProcedureStatus::Reconciliated);

        Ok(())
    }

    /// R9 — Updating a FUND transfer reverts old groups and applies new ones.
    #[tokio::test]
    async fn test_update_fund_transfer_swaps_groups() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, fund_id, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, fund_svc, proc_svc) = make_components(&pool);

        let p1 = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "RECONCILIATED",
            100_000,
        )
        .await;
        let group_a = seed_fund_group(
            &pool,
            &fund_id,
            "2026-03-10",
            100_000,
            std::slice::from_ref(&p1),
            "ACTIVE",
        )
        .await;

        let p2 = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-12",
            "RECONCILIATED",
            200_000,
        )
        .await;
        let group_b = seed_fund_group(
            &pool,
            &fund_id,
            "2026-03-12",
            200_000,
            std::slice::from_ref(&p2),
            "ACTIVE",
        )
        .await;

        let create_result = orchestrator
            .create_fund_transfer(
                "cash-account-default".to_string(),
                "2026-03-15".to_string(),
                vec![group_a.clone()],
            )
            .await?;

        orchestrator
            .update_fund_transfer(
                create_result.transfer_id,
                "2026-03-16".to_string(),
                vec![group_b.clone()],
            )
            .await?;

        let ga = fund_svc.read_group(&group_a).await?.unwrap();
        assert_eq!(
            ga.status,
            FundPaymentGroupStatus::Active,
            "Old group should revert to Active"
        );

        let gb = fund_svc.read_group(&group_b).await?.unwrap();
        assert_eq!(
            gb.status,
            FundPaymentGroupStatus::BankPayed,
            "New group should be BankPayed"
        );

        let proc1 = proc_svc.read_procedure(&p1).await?.unwrap();
        assert_eq!(
            proc1.payment_status,
            ProcedureStatus::Reconciliated,
            "Old group procedure should revert"
        );

        let proc2 = proc_svc.read_procedure(&p2).await?.unwrap();
        assert_eq!(
            proc2.payment_status,
            ProcedureStatus::FundPayed,
            "New group procedure should be FundPayed"
        );

        Ok(())
    }

    /// R15 — Creating a direct transfer sets procedures to DirectlyPayed.
    #[tokio::test]
    async fn test_create_direct_transfer_sets_directly_payed() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, _, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, _, proc_svc) = make_components(&pool);

        let proc_id = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "CREATED",
            120_000,
        )
        .await;

        let result = orchestrator
            .create_direct_transfer(
                "cash-account-default".to_string(),
                "2026-03-15".to_string(),
                BankTransferType::Check,
                vec![proc_id.clone()],
            )
            .await?;

        assert_eq!(result.linked_count, 1);

        let procedure = proc_svc.read_procedure(&proc_id).await?.unwrap();
        assert_eq!(procedure.payment_status, ProcedureStatus::DirectlyPayed);
        assert_eq!(
            procedure.confirmed_payment_date,
            NaiveDate::from_ymd_opt(2026, 3, 15)
        );

        Ok(())
    }

    /// R16 — Deleting a direct transfer reverts procedures to Created.
    #[tokio::test]
    async fn test_delete_direct_transfer_reverts_procedures_to_created() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, _, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, _, proc_svc) = make_components(&pool);

        let proc_id = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "CREATED",
            120_000,
        )
        .await;

        let result = orchestrator
            .create_direct_transfer(
                "cash-account-default".to_string(),
                "2026-03-15".to_string(),
                BankTransferType::Check,
                vec![proc_id.clone()],
            )
            .await?;

        orchestrator
            .delete_direct_transfer(result.transfer_id)
            .await?;

        let procedure = proc_svc.read_procedure(&proc_id).await?.unwrap();
        assert_eq!(procedure.payment_status, ProcedureStatus::Created);

        Ok(())
    }

    /// R21 — get_fund_groups_by_ids returns FundGroupCandidate for BankPayed groups.
    #[tokio::test]
    async fn test_get_fund_groups_by_ids_returns_candidate_for_bank_payed_group(
    ) -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, fund_id, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, _, _) = make_components(&pool);

        let proc_id = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "FUND_PAYED",
            150_000,
        )
        .await;

        // Seed the group already in BankPayed state (as it would be after a FUND transfer).
        let group_id: String = seed_fund_group(
            &pool,
            &fund_id,
            "2026-03-10",
            150_000,
            std::slice::from_ref(&proc_id),
            "BANK_PAYED",
        )
        .await;

        let candidates = orchestrator
            .get_fund_groups_by_ids(vec![group_id.clone()])
            .await?;

        assert_eq!(
            candidates.len(),
            1,
            "Exactly one candidate should be returned"
        );

        let candidate = &candidates[0];
        assert_eq!(candidate.group_id, group_id);
        assert_eq!(candidate.fund_id, fund_id);
        assert_eq!(candidate.payment_date, "2026-03-10");
        assert_eq!(candidate.total_amount, 150_000);

        Ok(())
    }

    /// R21 — get_fund_groups_by_ids silently skips unknown group IDs.
    #[tokio::test]
    async fn test_get_fund_groups_by_ids_skips_unknown_ids() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (orchestrator, _, _) = make_components(&pool);

        let candidates = orchestrator
            .get_fund_groups_by_ids(vec!["non-existent-id".to_string()])
            .await?;

        assert!(
            candidates.is_empty(),
            "Unknown group IDs should be silently skipped"
        );

        Ok(())
    }

    /// R21 — get_procedures_by_ids returns DirectPaymentProcedureCandidate for DirectlyPayed procedures.
    #[tokio::test]
    async fn test_get_procedures_by_ids_returns_candidate_for_directly_payed_procedure(
    ) -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, _, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, _, proc_svc) = make_components(&pool);

        // Seed a procedure then create a direct transfer to put it into DirectlyPayed state.
        let proc_id: String = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "CREATED",
            120_000,
        )
        .await;

        orchestrator
            .create_direct_transfer(
                "cash-account-default".to_string(),
                "2026-03-12".to_string(),
                BankTransferType::Check,
                vec![proc_id.clone()],
            )
            .await?;

        let procedure = proc_svc.read_procedure(&proc_id).await?.unwrap();
        assert_eq!(procedure.payment_status, ProcedureStatus::DirectlyPayed);

        let candidates = orchestrator
            .get_procedures_by_ids(vec![proc_id.clone()])
            .await?;

        assert_eq!(
            candidates.len(),
            1,
            "Exactly one candidate should be returned"
        );

        let candidate = &candidates[0];
        assert_eq!(candidate.procedure_id, proc_id);
        assert_eq!(candidate.patient_id, patient_id);
        assert_eq!(candidate.procedure_date, "2026-03-10");
        assert_eq!(candidate.procedure_amount, Some(120_000));

        Ok(())
    }

    /// R21 — get_procedures_by_ids returns an empty list for unknown IDs.
    #[tokio::test]
    async fn test_get_procedures_by_ids_returns_empty_for_unknown_ids() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (orchestrator, _, _) = make_components(&pool);

        let candidates = orchestrator
            .get_procedures_by_ids(vec!["non-existent-proc-id".to_string()])
            .await?;

        assert!(
            candidates.is_empty(),
            "Unknown procedure IDs should return empty list"
        );

        Ok(())
    }

    // ======================================================================
    // R4 — Immutable transfer type guards
    // ======================================================================

    /// R4 — update_fund_transfer rejects a direct (CHECK) transfer ID.
    #[tokio::test]
    async fn test_r4_update_fund_transfer_rejects_direct_transfer() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, _, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, _, _) = make_components(&pool);

        // Create a CHECK transfer via direct path
        let proc_id = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "CREATED",
            120_000,
        )
        .await;
        let result = orchestrator
            .create_direct_transfer(
                "cash-account-default".to_string(),
                "2026-03-10".to_string(),
                BankTransferType::Check,
                vec![proc_id],
            )
            .await?;

        // Attempt to update it as a FUND transfer — must fail
        let err = orchestrator
            .update_fund_transfer(result.transfer_id, "2026-03-11".to_string(), vec![])
            .await;

        assert!(
            err.is_err(),
            "Expected error when calling update_fund_transfer on a CHECK transfer"
        );
        let msg = err.unwrap_err().to_string();
        assert!(
            msg.contains("R4"),
            "Error message should reference R4: {msg}"
        );

        Ok(())
    }

    /// R4 — update_direct_transfer rejects a FUND transfer ID.
    #[tokio::test]
    async fn test_r4_update_direct_transfer_rejects_fund_transfer() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, fund_id, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, _, _) = make_components(&pool);

        // Create a FUND transfer
        let proc_id = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "RECONCILIATED",
            150_000,
        )
        .await;
        let group_id = seed_fund_group(
            &pool,
            &fund_id,
            "2026-03-10",
            150_000,
            std::slice::from_ref(&proc_id),
            "ACTIVE",
        )
        .await;
        let result = orchestrator
            .create_fund_transfer(
                "cash-account-default".to_string(),
                "2026-03-10".to_string(),
                vec![group_id],
            )
            .await?;

        // Attempt to update it as a direct transfer — must fail
        let err = orchestrator
            .update_direct_transfer(result.transfer_id, "2026-03-11".to_string(), vec![])
            .await;

        assert!(
            err.is_err(),
            "Expected error when calling update_direct_transfer on a FUND transfer"
        );
        let msg = err.unwrap_err().to_string();
        assert!(
            msg.contains("R4"),
            "Error message should reference R4: {msg}"
        );

        Ok(())
    }

    /// R4 — delete_fund_transfer rejects a direct (CHECK) transfer ID.
    #[tokio::test]
    async fn test_r4_delete_fund_transfer_rejects_direct_transfer() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, _, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, _, _) = make_components(&pool);

        let proc_id = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "CREATED",
            120_000,
        )
        .await;
        let result = orchestrator
            .create_direct_transfer(
                "cash-account-default".to_string(),
                "2026-03-10".to_string(),
                BankTransferType::Check,
                vec![proc_id],
            )
            .await?;

        let err = orchestrator.delete_fund_transfer(result.transfer_id).await;

        assert!(
            err.is_err(),
            "Expected error when calling delete_fund_transfer on a CHECK transfer"
        );
        let msg = err.unwrap_err().to_string();
        assert!(
            msg.contains("R4"),
            "Error message should reference R4: {msg}"
        );

        Ok(())
    }

    /// R4 — delete_direct_transfer rejects a FUND transfer ID.
    #[tokio::test]
    async fn test_r4_delete_direct_transfer_rejects_fund_transfer() -> anyhow::Result<()> {
        let pool = setup_db().await;
        let (patient_id, fund_id, proc_type_id) = seed_base(&pool).await;
        let (orchestrator, _, _) = make_components(&pool);

        let proc_id = seed_procedure(
            &pool,
            &patient_id,
            &proc_type_id,
            "2026-03-10",
            "RECONCILIATED",
            150_000,
        )
        .await;
        let group_id = seed_fund_group(
            &pool,
            &fund_id,
            "2026-03-10",
            150_000,
            std::slice::from_ref(&proc_id),
            "ACTIVE",
        )
        .await;
        let result = orchestrator
            .create_fund_transfer(
                "cash-account-default".to_string(),
                "2026-03-10".to_string(),
                vec![group_id],
            )
            .await?;

        let err = orchestrator
            .delete_direct_transfer(result.transfer_id)
            .await;

        assert!(
            err.is_err(),
            "Expected error when calling delete_direct_transfer on a FUND transfer"
        );
        let msg = err.unwrap_err().to_string();
        assert!(
            msg.contains("R4"),
            "Error message should reference R4: {msg}"
        );

        Ok(())
    }
}
