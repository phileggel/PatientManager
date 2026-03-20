use std::sync::Arc;

use tauri::State;

use super::{BankAccount, BankAccountService, BankTransfer, BankTransferService, BankTransferType};

// ============ BankTransfer Tauri Commands ============

/// Tauri command: Create a new bank transfer (bare — links managed by bank_manual_match use_case)
#[tauri::command]
#[specta::specta]
pub async fn create_bank_transfer(
    transfer_date: String,
    amount: i64,
    transfer_type: BankTransferType,
    bank_account_id: String,
    service: State<'_, Arc<BankTransferService>>,
) -> Result<BankTransfer, String> {
    service
        .create_transfer(transfer_date, amount, transfer_type, bank_account_id, false)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Tauri command: Read all bank transfers with account info
#[tauri::command]
#[specta::specta]
pub async fn read_all_bank_transfers(
    service: State<'_, Arc<BankTransferService>>,
) -> Result<Vec<BankTransfer>, String> {
    service
        .read_all_transfers()
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Tauri command: Read a single bank transfer with account info
#[tauri::command]
#[specta::specta]
pub async fn read_bank_transfer(
    id: String,
    service: State<'_, Arc<BankTransferService>>,
) -> Result<Option<BankTransfer>, String> {
    service
        .read_transfer(&id)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Tauri command: Update an existing bank transfer
#[tauri::command]
#[specta::specta]
pub async fn update_bank_transfer(
    transfer: BankTransfer,
    service: State<'_, Arc<BankTransferService>>,
) -> Result<BankTransfer, String> {
    service
        .update_transfer(transfer)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Tauri command: Delete a bank transfer
#[tauri::command]
#[specta::specta]
pub async fn delete_bank_transfer(
    id: String,
    service: State<'_, Arc<BankTransferService>>,
) -> Result<(), String> {
    service
        .delete_transfer(&id)
        .await
        .map_err(|e| format!("{:#}", e))
}

// ============ BankAccount Tauri Commands ============

/// Tauri command: Create a new bank account
#[tauri::command]
#[specta::specta]
pub async fn create_bank_account(
    name: String,
    iban: Option<String>,
    service: State<'_, Arc<BankAccountService>>,
) -> Result<BankAccount, String> {
    service
        .create_account(name, iban)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Tauri command: Read all bank accounts
#[tauri::command]
#[specta::specta]
pub async fn read_all_bank_accounts(
    service: State<'_, Arc<BankAccountService>>,
) -> Result<Vec<BankAccount>, String> {
    service
        .read_all_accounts()
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Tauri command: Read a single bank account
#[tauri::command]
#[specta::specta]
pub async fn read_bank_account(
    id: String,
    service: State<'_, Arc<BankAccountService>>,
) -> Result<Option<BankAccount>, String> {
    service
        .read_account(&id)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Tauri command: Update a bank account
#[tauri::command]
#[specta::specta]
pub async fn update_bank_account(
    id: String,
    name: String,
    iban: Option<String>,
    service: State<'_, Arc<BankAccountService>>,
) -> Result<BankAccount, String> {
    service
        .update_account(id, name, iban)
        .await
        .map_err(|e| format!("{:#}", e))
}

/// Tauri command: Delete a bank account
#[tauri::command]
#[specta::specta]
pub async fn delete_bank_account(
    id: String,
    service: State<'_, Arc<BankAccountService>>,
) -> Result<(), String> {
    service
        .delete_account(&id)
        .await
        .map_err(|e| format!("{:#}", e))
}
