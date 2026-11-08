use std::sync::Arc;

use tauri::State;

use super::{
    BankAccount, BankAccountService, BankEntry, BankEntryService, BankEntryType, BankError,
};

// ============ BankEntry Tauri Commands ============

/// Tauri command: Create a new bank transfer (bare — links managed by bank_manual_match use_case)
#[tauri::command]
#[specta::specta]
pub async fn create_bank_transfer(
    transfer_date: String,
    amount: i64,
    transfer_type: BankEntryType,
    bank_account_id: String,
    service: State<'_, Arc<BankEntryService>>,
) -> Result<BankEntry, BankError> {
    service
        .create_transfer(transfer_date, amount, transfer_type, bank_account_id, false)
        .await
}

/// Tauri command: Read all bank transfers with account info
#[tauri::command]
#[specta::specta]
pub async fn read_all_bank_transfers(
    service: State<'_, Arc<BankEntryService>>,
) -> Result<Vec<BankEntry>, BankError> {
    service.read_all_transfers().await
}

/// Tauri command: Read a single bank transfer with account info
#[tauri::command]
#[specta::specta]
pub async fn read_bank_transfer(
    id: String,
    service: State<'_, Arc<BankEntryService>>,
) -> Result<Option<BankEntry>, BankError> {
    service.read_transfer(&id).await
}

/// Tauri command: Update an existing bank transfer
#[tauri::command]
#[specta::specta]
pub async fn update_bank_transfer(
    transfer: BankEntry,
    service: State<'_, Arc<BankEntryService>>,
) -> Result<BankEntry, BankError> {
    service.update_transfer(transfer).await
}

/// Tauri command: Delete a bank transfer
#[tauri::command]
#[specta::specta]
pub async fn delete_bank_transfer(
    id: String,
    service: State<'_, Arc<BankEntryService>>,
) -> Result<(), BankError> {
    service.delete_transfer(&id).await
}

// ============ BankAccount Tauri Commands ============

/// Tauri command: Create a new bank account
#[tauri::command]
#[specta::specta]
pub async fn create_bank_account(
    name: String,
    iban: Option<String>,
    service: State<'_, Arc<BankAccountService>>,
) -> Result<BankAccount, BankError> {
    service.create_account(name, iban).await
}

/// Tauri command: Read all bank accounts
#[tauri::command]
#[specta::specta]
pub async fn read_all_bank_accounts(
    service: State<'_, Arc<BankAccountService>>,
) -> Result<Vec<BankAccount>, BankError> {
    service.read_all_accounts().await
}

/// Tauri command: Update a bank account
#[tauri::command]
#[specta::specta]
pub async fn update_bank_account(
    id: String,
    name: String,
    iban: Option<String>,
    service: State<'_, Arc<BankAccountService>>,
) -> Result<BankAccount, BankError> {
    service.update_account(id, name, iban).await
}

/// Tauri command: Delete a bank account
#[tauri::command]
#[specta::specta]
pub async fn delete_bank_account(
    id: String,
    service: State<'_, Arc<BankAccountService>>,
) -> Result<(), BankError> {
    service.delete_account(&id).await
}
