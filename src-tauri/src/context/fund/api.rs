use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::context::fund::{AffiliatedFund, FundPaymentGroup, FundPaymentService, FundService};

// ============ Domain-Relevant Types ============

/// Fund candidate for batch import - semantically different from AffiliatedFund (lacks ID, created_at)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundCandidate {
    pub temp_id: String,
    pub fund_identifier: String,
    pub fund_name: String,
}

/// Fund payment group candidate created from PDF reconciliation data
/// Groups matched procedures by (fund_id + payment_date)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundPaymentGroupCandidate {
    /// Fund identifier from PDF (e.g., "CPAM n° 931")
    pub fund_label: String,
    /// Payment date (serialized as ISO string YYYY-MM-DD for frontend)
    #[specta(type = String)]
    pub payment_date: chrono::NaiveDate,
    /// Total amount stated in PDF for this group
    pub total_amount: i64,
    /// List of matched procedure IDs for this group
    pub procedure_ids: Vec<String>,
    /// Sum of matched procedure amounts
    pub matched_amount: i64,
    /// Coverage status: is matched_amount == total_amount?
    pub is_fully_covered: bool,
}

/// Validation status for fund candidate
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FundValidationStatus {
    Valid,
    AlreadyExists,
    Invalid,
}

/// Validation result wraps candidate with validation outcome
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FundValidationResult {
    pub candidate: FundCandidate,
    pub status: FundValidationStatus,
    pub existing_id: Option<String>,
    pub error: Option<String>,
}

/// Complex response: validation results
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ValidateBatchFundsResponse {
    pub results: Vec<FundValidationResult>,
}

/// Complex response: created funds + temp ID mapping for import tracking
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreateBatchFundsResponse {
    pub funds: Vec<AffiliatedFund>,
    pub temp_id_map: HashMap<String, String>,
}

// ============ Tauri Commands ============

/// Tauri command: Add a new affiliated fund
#[tauri::command]
#[specta::specta]
pub async fn add_fund(
    fund_identifier: String,
    fund_name: String,
    service: State<'_, Arc<FundService>>,
) -> Result<AffiliatedFund, String> {
    tracing::info!(fund_identifier = %fund_identifier, fund_name = %fund_name, "Processing add fund request");

    service
        .create_fund(fund_identifier, fund_name)
        .await
        .inspect(|fund| {
            tracing::info!(fund_id = ?fund.id, "Fund added successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to add fund");
            format!("{:#}", e)
        })
}

/// Tauri command: Read all affiliated funds
#[tauri::command]
#[specta::specta]
pub async fn read_all_funds(
    service: State<'_, Arc<FundService>>,
) -> Result<Vec<AffiliatedFund>, String> {
    tracing::info!("Processing read all funds request");

    service
        .read_all_funds()
        .await
        .inspect(|funds| {
            tracing::info!(count = funds.len(), "Retrieved funds successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to retrieve funds");
            format!("{:#}", e)
        })
}

/// Tauri command: Update an existing affiliated fund
#[tauri::command]
#[specta::specta]
pub async fn update_fund(
    fund: AffiliatedFund,
    service: State<'_, Arc<FundService>>,
) -> Result<AffiliatedFund, String> {
    tracing::info!(fund_id = ?fund.id, "Processing update fund request");

    service
        .update_fund(fund)
        .await
        .inspect(|fund| {
            tracing::info!(fund_id = ?fund.id, "Fund updated successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to update fund");
            format!("{:#}", e)
        })
}

/// Tauri command: Delete an affiliated fund
#[tauri::command]
#[specta::specta]
pub async fn delete_fund(id: String, service: State<'_, Arc<FundService>>) -> Result<(), String> {
    tracing::info!(fund_id = %id, "Processing delete fund request");

    service
        .delete_fund(&id)
        .await
        .inspect(|_| {
            tracing::info!(fund_id = %id, "Fund deleted successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to delete fund");
            format!("{:#}", e)
        })
}

/// Tauri command: Validate batch of fund candidates
#[tauri::command]
#[specta::specta]
pub async fn validate_batch_funds(
    funds: Vec<FundCandidate>,
    service: State<'_, Arc<FundService>>,
) -> Result<ValidateBatchFundsResponse, String> {
    tracing::info!(
        count = funds.len(),
        "Processing validate batch funds request"
    );

    let results = service.validate_batch(funds).await.map_err(|e| {
        tracing::error!(error = %e, "Failed to validate batch funds");
        format!("{:#}", e)
    })?;

    tracing::info!(count = results.len(), "Batch funds validated successfully");
    Ok(ValidateBatchFundsResponse { results })
}

/// Tauri command: Create batch of funds
#[tauri::command]
#[specta::specta]
pub async fn create_batch_funds(
    funds: Vec<FundCandidate>,
    service: State<'_, Arc<FundService>>,
) -> Result<CreateBatchFundsResponse, String> {
    tracing::info!(count = funds.len(), "Processing create batch funds request");

    let created_funds = service.create_batch(funds.clone()).await.map_err(|e| {
        tracing::error!(error = %e, "Failed to create batch funds");
        format!("{:#}", e)
    })?;

    let mut temp_id_map = HashMap::new();
    for (i, candidate) in funds.iter().enumerate() {
        if let Some(created_fund) = created_funds.get(i) {
            temp_id_map.insert(candidate.temp_id.clone(), created_fund.id.clone());
        }
    }

    tracing::info!(
        count = created_funds.len(),
        "Batch funds created successfully"
    );
    Ok(CreateBatchFundsResponse {
        funds: created_funds,
        temp_id_map,
    })
}

// ============ Fund Payment Commands ============

/// Tauri command: Read all fund payment groups
///
/// Computes is_locked for each group by checking if any associated procedure
/// is in a bank-reconciled status (FundPayed or PartiallyFundPayed).
#[tauri::command]
#[specta::specta]
pub async fn read_all_fund_payment_groups(
    fund_payment_service: State<'_, Arc<FundPaymentService>>,
    procedure_service: State<'_, Arc<crate::context::procedure::ProcedureService>>,
) -> Result<Vec<FundPaymentGroup>, String> {
    tracing::info!("Processing read all fund payment groups request");

    let mut groups = fund_payment_service.read_all_groups().await.map_err(|e| {
        tracing::error!(error = %e, "Failed to retrieve fund payment groups");
        format!("{:#}", e)
    })?;

    // Collect all procedure IDs across all groups (single batch fetch)
    let all_procedure_ids: Vec<String> = groups
        .iter()
        .flat_map(|g| g.lines.iter().map(|l| l.procedure_id.clone()))
        .collect();

    if !all_procedure_ids.is_empty() {
        let procedures = procedure_service
            .read_procedures_by_ids(all_procedure_ids)
            .await
            .map_err(|e| format!("{:#}", e))?;

        // Build a set of bank-reconciled procedure IDs
        let locked_procedure_ids: std::collections::HashSet<String> = procedures
            .into_iter()
            .filter(|p| {
                matches!(
                    p.payment_status,
                    crate::context::procedure::ProcedureStatus::FundPayed
                        | crate::context::procedure::ProcedureStatus::PartiallyFundPayed
                )
            })
            .map(|p| p.id)
            .collect();

        // Set is_locked on each group
        for group in &mut groups {
            group.is_locked = group
                .lines
                .iter()
                .any(|l| locked_procedure_ids.contains(&l.procedure_id));
        }
    }

    tracing::info!(
        count = groups.len(),
        "Retrieved fund payment groups successfully"
    );
    Ok(groups)
}

/// Tauri command: Delete a fund payment group with procedure cleanup
///
/// Deletes the group, its lines, and resets associated procedures
/// (status → Created, clears confirmed_payment_date and actual_payment_amount)
#[tauri::command]
#[specta::specta]
pub async fn delete_fund_payment_group(
    group_id: String,
    fund_service: State<'_, Arc<FundService>>,
    fund_payment_service: State<'_, Arc<FundPaymentService>>,
    procedure_service: State<'_, Arc<crate::context::procedure::ProcedureService>>,
    event_bus: State<'_, Arc<crate::core::event_bus::EventBus>>,
) -> Result<(), String> {
    tracing::info!(group_id = %group_id, "Processing delete fund payment group request");

    let orchestrator =
        crate::use_cases::fund_payment_reconciliation::FundPaymentReconciliationOrchestrator::new(
            fund_service.inner().clone(),
            procedure_service.inner().clone(),
            fund_payment_service.inner().clone(),
            event_bus.inner().clone(),
        );

    orchestrator
        .delete_fund_payment_group_with_cleanup(&group_id)
        .await
        .inspect(|_| {
            tracing::info!(group_id = %group_id, "Fund payment group deleted with cleanup");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to delete fund payment group");
            format!("{:#}", e)
        })
}

/// Tauri command: Create a fund payment group from manual UI selection
///
/// Calculates total_amount from procedure amounts and sets procedures to Reconciliated.
#[tauri::command]
#[specta::specta]
pub async fn create_fund_payment_group(
    fund_id: String,
    payment_date: String,
    procedure_ids: Vec<String>,
    fund_service: State<'_, Arc<FundService>>,
    fund_payment_service: State<'_, Arc<FundPaymentService>>,
    procedure_service: State<'_, Arc<crate::context::procedure::ProcedureService>>,
    event_bus: State<'_, Arc<crate::core::event_bus::EventBus>>,
) -> Result<FundPaymentGroup, String> {
    tracing::info!(
        fund_id = %fund_id,
        payment_date = %payment_date,
        procedure_count = procedure_ids.len(),
        "Processing create fund payment group request"
    );

    let orchestrator =
        crate::use_cases::fund_payment_reconciliation::FundPaymentReconciliationOrchestrator::new(
            fund_service.inner().clone(),
            procedure_service.inner().clone(),
            fund_payment_service.inner().clone(),
            event_bus.inner().clone(),
        );

    orchestrator
        .create_manual_fund_payment_group(fund_id, payment_date, procedure_ids)
        .await
        .inspect(|group| {
            tracing::info!(group_id = %group.id, "Fund payment group created successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to create fund payment group");
            format!("{:#}", e)
        })
}

/// Tauri command: Update a fund payment group with new procedures
///
/// Handles add/remove procedure logic via orchestrator:
/// - Removed procedures → reset to Created
/// - Added procedures → set to Reconciliated
/// - Recalculates total_amount
/// - Rejects if any procedure is bank-reconciled (FundPayed/PartiallyFundPayed)
#[tauri::command]
#[specta::specta]
pub async fn update_fund_payment_group_with_procedures(
    group_id: String,
    payment_date: String,
    procedure_ids: Vec<String>,
    fund_service: State<'_, Arc<FundService>>,
    fund_payment_service: State<'_, Arc<FundPaymentService>>,
    procedure_service: State<'_, Arc<crate::context::procedure::ProcedureService>>,
    event_bus: State<'_, Arc<crate::core::event_bus::EventBus>>,
) -> Result<FundPaymentGroup, String> {
    tracing::info!(
        group_id = %group_id,
        payment_date = %payment_date,
        procedure_count = procedure_ids.len(),
        "Processing update fund payment group request"
    );

    let orchestrator =
        crate::use_cases::fund_payment_reconciliation::FundPaymentReconciliationOrchestrator::new(
            fund_service.inner().clone(),
            procedure_service.inner().clone(),
            fund_payment_service.inner().clone(),
            event_bus.inner().clone(),
        );

    orchestrator
        .update_manual_fund_payment_group(group_id, payment_date, procedure_ids)
        .await
        .inspect(|group| {
            tracing::info!(group_id = %group.id, "Fund payment group updated successfully");
        })
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to update fund payment group");
            format!("{:#}", e)
        })
}
