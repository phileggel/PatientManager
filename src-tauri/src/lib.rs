#![cfg_attr(not(test), deny(clippy::unwrap_used))]
#![cfg_attr(not(test), deny(clippy::expect_used))]
#![cfg_attr(not(test), deny(clippy::panic))]
#![cfg_attr(not(test), deny(clippy::indexing_slicing))]
#![cfg_attr(not(test), deny(clippy::todo))]
#![cfg_attr(not(test), deny(clippy::unimplemented))]
/// AI AGENT SHOULD NEVER UPDATE THIS CLIPPY BLOCK
pub mod context;
pub mod core;
pub mod use_cases;

// Re-export repositories for use_cases modules
pub use context::fund::FundRepository;
pub use context::patient::PatientRepository;
pub use context::procedure::ProcedureTypeRepository;

use anyhow::{Context, Result};
use context::fund::SqliteFundRepository;
use context::patient::{PatientService, SqlitePatientRepository};
use context::procedure::ProcedureTypeService;
use std::sync::Arc;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::context::bank::{
    BankAccountService, BankTransferService, SqliteBankAccountRepository,
    SqliteBankTransferRepository,
};
use crate::context::fund::FundService;
use crate::context::procedure::{
    ProcedureService, SqliteProcedureRepository, SqliteProcedureTypeRepository,
};

use crate::context::fund::{FundPaymentService, SqliteFundPaymentRepository};
use crate::core::event_bus::*;
use crate::core::logger::*;
use crate::use_cases::bank_statement_reconciliation::{
    BankStatementOrchestrator, SqliteBankFundLabelMappingRepository,
};
use crate::use_cases::excel_import::ExcelImportOrchestrator;
use crate::use_cases::fund_payment_reconciliation::{
    FundPaymentReconciliationOrchestrator, ReconciliationService,
};
use crate::use_cases::procedure_orchestration::ProcedureOrchestrationService;

/// Initialize the application backend
///
/// Sets up the database connection, creates application services,
/// and registers them with Tauri state management
pub async fn initialize_app<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<()> {
    // Create app directories
    let dirs = create_app_dirs(app)?;

    // Initialize tracing with file logging
    initialize_tracing(&dirs.log_dir)?;
    tracing::info!(target: BACKEND, "Initializing application backend");
    tracing::trace!(target: BACKEND, data_dir = ?dirs.local_data_dir, log_dir = ?dirs.log_dir, "Application directories");

    // Initialize database with proper path
    // let db_path = dirs.local_data_dir.join("patient_management.db");

    // Check if database reset is requested
    let is_db_reset = std::env::var("RESET_DATABASE")
        .map(|val| val.to_lowercase() == "true" || val == "1")
        .unwrap_or(false);

    let db = Arc::new(
        core::Database::new(dirs.local_data_dir.clone(), is_db_reset)
            .await
            .with_context(|| "Failed to initialize database")?,
    );
    tracing::info!(target: BACKEND, "Database initialized successfully");

    // Initialize event bus with broadcast channels for each event type
    let event_bus = Arc::new(EventBus::new());

    // Create and spawn event observers for each event type
    if let Ok(rx) = event_bus.subscribe::<PatientUpdated>() {
        EventObserver::<_, PatientUpdated>::new(app.clone(), rx).spawn("patient_updated");
    }
    if let Ok(rx) = event_bus.subscribe::<FundUpdated>() {
        EventObserver::<_, FundUpdated>::new(app.clone(), rx).spawn("fund_updated");
    }
    if let Ok(rx) = event_bus.subscribe::<ProcedureUpdated>() {
        EventObserver::<_, ProcedureUpdated>::new(app.clone(), rx).spawn("procedure_updated");
    }
    if let Ok(rx) = event_bus.subscribe::<ProcedureTypeUpdated>() {
        EventObserver::<_, ProcedureTypeUpdated>::new(app.clone(), rx)
            .spawn("procedure_type_updated");
    }
    if let Ok(rx) = event_bus.subscribe::<FundPaymentGroupUpdated>() {
        EventObserver::<_, FundPaymentGroupUpdated>::new(app.clone(), rx)
            .spawn("fund_payment_group_updated");
    }
    if let Ok(rx) = event_bus.subscribe::<BankTransferUpdated>() {
        EventObserver::<_, BankTransferUpdated>::new(app.clone(), rx).spawn("banktransfer_updated");
    }
    if let Ok(rx) = event_bus.subscribe::<BankAccountUpdated>() {
        EventObserver::<_, BankAccountUpdated>::new(app.clone(), rx).spawn("bankaccount_updated");
    }

    // Register event bus with Tauri state
    app.manage(event_bus.clone());
    tracing::info!(target: BACKEND, "Event bus initialized successfully");

    // Create patient service with database as repository and event bus
    let patient_repository = Arc::new(SqlitePatientRepository::new(db.get_pool().clone()));
    let patient_service = Arc::new(PatientService::new(
        patient_repository.clone(),
        event_bus.clone(),
    ));
    tracing::info!(target: BACKEND, "Patient service created");

    // Create affiliated fund service with database as repository and event bus
    let fund_repository = Arc::new(SqliteFundRepository::new(db.get_pool().clone()));
    let fund_service = Arc::new(FundService::new(fund_repository.clone(), event_bus.clone()));
    tracing::info!(target: BACKEND, "Affiliated fund service created");

    // Create procedure type repository and service
    let procedure_type_repository =
        Arc::new(SqliteProcedureTypeRepository::new(db.get_pool().clone()));
    let procedure_type_service = Arc::new(ProcedureTypeService::new(
        procedure_type_repository.clone(),
        event_bus.clone(),
    ));
    tracing::info!(target: BACKEND, "Procedure type service created");

    // Create context/procedure/ProcedureService with basic CRUD operations
    let procedure_repository = Arc::new(SqliteProcedureRepository::new(db.get_pool().clone()));
    let context_procedure_service = Arc::new(ProcedureService::new(
        procedure_repository.clone(),
        event_bus.clone(),
    ));
    tracing::info!(target: BACKEND, "Context procedure service created");

    // Create orchestration service with cross-context dependencies
    let procedure_orchestration_service = Arc::new(ProcedureOrchestrationService::new(
        context_procedure_service.clone(),
        patient_repository.clone(),
        procedure_type_repository.clone(),
        fund_repository.clone(),
    ));
    tracing::info!(target: BACKEND, "Procedure orchestration service created");

    // Create reconciliation service
    let reconciliation_service = Arc::new(ReconciliationService::new(
        procedure_repository.clone(),
        fund_repository.clone(),
    ));
    tracing::info!(target: BACKEND, "Reconciliation service created");

    // Create fund payment service with database as repository and event bus
    let fund_payment_repository = Arc::new(SqliteFundPaymentRepository::new(db.get_pool().clone()));
    let fund_payment_service = Arc::new(FundPaymentService::new(
        fund_payment_repository,
        event_bus.clone(),
    ));
    tracing::info!(target: BACKEND, "Fund payment service created");

    // Create bank account repository and service first (needed by bank transfer service)
    let bank_account_repository = Arc::new(SqliteBankAccountRepository::new(db.get_pool().clone()));
    let bank_account_service = Arc::new(BankAccountService::new(
        bank_account_repository.clone(),
        event_bus.clone(),
    ));
    tracing::info!(target: BACKEND, "Bank account service created");

    // Create bank transfer service with database as repository and event bus
    let bank_transfer_repository =
        Arc::new(SqliteBankTransferRepository::new(db.get_pool().clone()));
    let bank_transfer_service = Arc::new(BankTransferService::new(
        bank_transfer_repository,
        bank_account_repository,
        event_bus.clone(),
    ));
    tracing::info!(target: BACKEND, "Bank transfer service created");

    // Create bank statement reconciliation orchestrator
    let label_mapping_repo = Arc::new(SqliteBankFundLabelMappingRepository::new(
        db.get_pool().clone(),
    ));
    let bank_statement_orchestrator = Arc::new(BankStatementOrchestrator::new(
        bank_account_service.clone(),
        fund_service.clone(),
        fund_payment_service.clone(),
        bank_transfer_service.clone(),
        context_procedure_service.clone(),
        label_mapping_repo,
        event_bus.clone(),
    ));
    tracing::info!(target: BACKEND, "Bank statement orchestrator created");

    // Create fund payment reconciliation orchestrator
    let fund_payment_reconciliation_orchestrator =
        Arc::new(FundPaymentReconciliationOrchestrator::new(
            fund_service.clone(),
            context_procedure_service.clone(),
            fund_payment_service.clone(),
            event_bus.clone(),
        ));
    tracing::info!(target: BACKEND, "Fund payment reconciliation orchestrator created");

    // Create Excel import orchestrator
    let excel_import_orchestrator = Arc::new(ExcelImportOrchestrator::new(
        patient_service.clone(),
        fund_service.clone(),
        context_procedure_service.clone(),
        procedure_orchestration_service.clone(),
    ));
    tracing::info!(target: BACKEND, "Excel import orchestrator created");

    // Register services with Tauri state management
    app.manage(patient_service);
    app.manage(fund_service);
    app.manage(context_procedure_service);
    app.manage(procedure_orchestration_service);
    app.manage(procedure_type_service);
    app.manage(reconciliation_service);
    app.manage(fund_payment_service);
    app.manage(bank_transfer_service);
    app.manage(bank_account_service);
    app.manage(bank_statement_orchestrator);
    app.manage(fund_payment_reconciliation_orchestrator);
    app.manage(excel_import_orchestrator);
    tracing::info!(target: BACKEND, "Application backend initialized successfully");
    Ok(())
}

#[derive(Debug, Clone)]
struct AppDirectories {
    local_data_dir: PathBuf,
    log_dir: PathBuf,
}

fn create_app_dirs<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<AppDirectories> {
    let path_resolver = app.path();

    let local_data_dir = path_resolver
        .app_local_data_dir()
        .with_context(|| "Failed to get app local data directory")?;
    fs::create_dir_all(&local_data_dir).with_context(|| "Failed to create data directory")?;

    let log_dir = path_resolver
        .app_log_dir()
        .with_context(|| "Failed to get app log directory")?;
    fs::create_dir_all(&log_dir).with_context(|| "Failed to create log directory")?;

    Ok(AppDirectories {
        local_data_dir,
        log_dir,
    })
}

/// Initialize tracing for logging with file output
fn initialize_tracing(log_dir: &std::path::Path) -> anyhow::Result<()> {
    let log_file = log_dir.join("app.log");

    let file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .with_context(|| "Failed to open log file.")?;

    tracing_subscriber::registry()
        .with(fmt::layer().with_ansi(false).with_writer(file))
        .with(fmt::layer().with_writer(std::io::stderr))
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("debug")))
        .init();

    tracing::trace!(target: BACKEND, "Logging initialized. Log file: {}", log_file.display());
    Ok(())
}
