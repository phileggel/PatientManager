use crate::shared::logger::BACKEND;
use std::sync::Arc;

use tauri::State;

use crate::context::fund::{Fund, FundError, FundPaymentGroup, FundPaymentService, FundService};

// ============ Tauri Commands ============

/// Tauri command: Add a new affiliated fund
#[tauri::command]
#[specta::specta]
pub async fn add_fund(
    fund_identifier: String,
    fund_name: String,
    service: State<'_, Arc<FundService>>,
) -> Result<Fund, FundError> {
    tracing::info!(target: BACKEND, fund_identifier = %fund_identifier, "Processing add fund request");

    service
        .create_fund(fund_identifier, fund_name)
        .await
        .inspect(|fund| {
            tracing::info!(target: BACKEND, fund_id = ?fund.id, "Fund added successfully");
        })
}

/// Tauri command: Read all affiliated funds
#[tauri::command]
#[specta::specta]
pub async fn read_all_funds(service: State<'_, Arc<FundService>>) -> Result<Vec<Fund>, FundError> {
    tracing::info!(target: BACKEND, "Processing read all funds request");

    service.read_all_funds().await.inspect(|funds| {
        tracing::info!(target: BACKEND, count = funds.len(), "Retrieved funds successfully");
    })
}

/// Tauri command: Update an existing affiliated fund
#[tauri::command]
#[specta::specta]
pub async fn update_fund(
    fund: Fund,
    service: State<'_, Arc<FundService>>,
) -> Result<Fund, FundError> {
    tracing::info!(target: BACKEND, fund_id = ?fund.id, "Processing update fund request");

    service.update_fund(fund).await.inspect(|fund| {
        tracing::info!(target: BACKEND, fund_id = ?fund.id, "Fund updated successfully");
    })
}

/// Tauri command: Delete an affiliated fund
#[tauri::command]
#[specta::specta]
pub async fn delete_fund(
    id: String,
    service: State<'_, Arc<FundService>>,
) -> Result<(), FundError> {
    tracing::info!(target: BACKEND, fund_id = %id, "Processing delete fund request");

    service.delete_fund(&id).await.inspect(|_| {
        tracing::info!(target: BACKEND, fund_id = %id, "Fund deleted successfully");
    })
}

// ============ Fund Payment Commands ============

/// Tauri command: Read all fund payment groups
///
/// `is_locked` is derived at restore time from the persisted
/// `FundPaymentGroupStatus` (BankPaid → locked).
#[tauri::command]
#[specta::specta]
pub async fn read_all_fund_payment_groups(
    fund_payment_service: State<'_, Arc<FundPaymentService>>,
) -> Result<Vec<FundPaymentGroup>, FundError> {
    tracing::info!(target: BACKEND, "Processing read all fund payment groups request");

    let groups = fund_payment_service.read_all_groups().await?;

    tracing::info!(
        target: BACKEND,
        count = groups.len(),
        "Retrieved fund payment groups successfully"
    );
    Ok(groups)
}
