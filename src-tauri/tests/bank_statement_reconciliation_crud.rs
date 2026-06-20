//! Integration tests for `compute_bank_statement_reconciliation` and
//! `validate_bank_statement_reconciliation` (BAS-060–094).
//!
//! Tests call the public orchestrator API (`compute_reconciliation`,
//! `validate_reconciliation`) through the crate's public surface — no mocks,
//! real in-memory SQLite.
//!
//! # Scenarios
//!
//! 1. `compute_reconciliation_end_to_end_auto_match` — auto-match happy path: saved
//!    mapping + eligible group → Matched from the initial pass.
//! 2. `compute_reconciliation_link_fund_cascade_end_to_end` — LinkFund correction
//!    resolves two lines for the same label and auto-matches the one with an
//!    eligible group.
//! 3. `compute_reconciliation_group_not_eligible_propagates` — assigning a locked
//!    group returns GroupNotEligible through the full stack.
//! 4. `validate_reconciliation_end_to_end` — wiring: happy path creates 1
//!    BankEntry for 1 auto-matched line.
//! 5. `validate_reconciliation_multi_group_n_entries` — N groups on one line
//!    → N BankEntry records (BAS-093).

use std::sync::Arc;

use patient_manager_app::{
    context::{
        bank::{
            BankAccountService, BankEntryService, SqliteBankAccountRepository,
            SqliteBankEntryLinkRepository, SqliteBankEntryRepository,
        },
        fund::{
            FundPaymentService, FundService, SqliteFundPaymentRepository, SqliteFundRepository,
        },
        procedure::{ProcedureService, SqliteProcedureRepository},
    },
    shared::event_bus::EventBus,
    use_cases::bank_statement_reconciliation::{
        bank_pdf_codec::{BankStatementCreditLine, BankStatementParseResult},
        reconciliation::{BankStatementCorrection, BankStatementLineStatus, FundAssignment},
        BankStatementReconciliationError, BankStatementReconciliationTask,
        SqliteBankFundLabelMappingRepository,
    },
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

async fn setup_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(":memory:")
        .await
        .expect("in-memory SQLite pool");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrations");
    pool
}

struct Ctx {
    orchestrator: Arc<
        patient_manager_app::use_cases::bank_statement_reconciliation::BankStatementOrchestrator,
    >,
}

fn build_ctx(pool: &SqlitePool) -> Ctx {
    let bus = Arc::new(EventBus::new());

    let bank_account_repo = Arc::new(SqliteBankAccountRepository::new(pool.clone()));
    let bank_account_service = Arc::new(BankAccountService::new(
        bank_account_repo.clone(),
        bus.clone(),
    ));

    let fund_repo = Arc::new(SqliteFundRepository::new(pool.clone()));
    let fund_service = Arc::new(FundService::new(fund_repo, bus.clone()));

    let fp_repo = Arc::new(SqliteFundPaymentRepository::new(pool.clone()));
    let fund_payment_service = Arc::new(FundPaymentService::new(fp_repo, bus.clone()));

    let bank_entry_repo = Arc::new(SqliteBankEntryRepository::new(pool.clone()));
    let bank_entry_service = Arc::new(BankEntryService::new(
        bank_entry_repo,
        bank_account_repo,
        bus.clone(),
    ));

    let transfer_link_repo = Arc::new(SqliteBankEntryLinkRepository::new(pool.clone()));
    let proc_repo = Arc::new(SqliteProcedureRepository::new(pool.clone()));
    let procedure_service = Arc::new(ProcedureService::new(proc_repo, bus.clone()));

    let label_mapping_repo = Arc::new(SqliteBankFundLabelMappingRepository::new(pool.clone()));

    let orchestrator = Arc::new(
        patient_manager_app::use_cases::bank_statement_reconciliation::BankStatementOrchestrator::new(
            bank_account_service,
            fund_service,
            fund_payment_service,
            bank_entry_service,
            transfer_link_repo,
            procedure_service,
            label_mapping_repo,
            bus,
        ),
    );

    Ctx { orchestrator }
}

// ---------------------------------------------------------------------------
// DB seed helpers (insert directly for test data setup)
// Use `sqlx::query()` (runtime, non-macro) — the project runs with
// `SQLX_OFFLINE=true` so `sqlx::query!` macros require cached queries.
// ---------------------------------------------------------------------------

async fn insert_bank_account(pool: &SqlitePool, id: &str) {
    sqlx::query("INSERT INTO bank_account (id, name, is_deleted) VALUES (?, 'Test Bank', 0)")
        .bind(id)
        .execute(pool)
        .await
        .expect("insert bank_account");
}

async fn insert_fund(pool: &SqlitePool, id: &str, identifier: &str, name: &str) {
    sqlx::query("INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES (?, ?, ?, 0)")
        .bind(id)
        .bind(identifier)
        .bind(name)
        .execute(pool)
        .await
        .expect("insert fund");
}

async fn insert_label_mapping(
    pool: &SqlitePool,
    id: &str,
    account_id: &str,
    label: &str,
    fund_id: Option<&str>,
) {
    sqlx::query(
        "INSERT INTO bank_fund_label_mapping (id, bank_account_id, bank_label, fund_id, is_deleted) VALUES (?, ?, ?, ?, 0)",
    )
    .bind(id)
    .bind(account_id)
    .bind(label)
    .bind(fund_id)
    .execute(pool)
    .await
    .expect("insert label mapping");
}

/// Insert a fund payment group.  The `status` column drives `is_locked`:
/// "BANK_PAYED" → locked, "ACTIVE" → not locked (schema has no separate
/// `is_locked` column; it is derived in the domain layer from the status).
async fn insert_fund_payment_group(
    pool: &SqlitePool,
    id: &str,
    fund_id: &str,
    payment_date: &str,
    total_amount: i64,
    status: &str,
) {
    sqlx::query(
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, is_deleted) VALUES (?, ?, ?, ?, ?, 0)",
    )
    .bind(id)
    .bind(fund_id)
    .bind(payment_date)
    .bind(total_amount)
    .bind(status)
    .execute(pool)
    .await
    .expect("insert fund_payment_group");
}

// ---------------------------------------------------------------------------
// Helpers — reusable parse results
// ---------------------------------------------------------------------------

fn parse_result_with_one_line(label: &str, date: &str, amount: i64) -> BankStatementParseResult {
    BankStatementParseResult {
        iban: None,
        period: None,
        credit_lines: vec![BankStatementCreditLine {
            date: date.to_string(),
            label: label.to_string(),
            amount,
        }],
        total_credits: amount,
        unparsed_count: 0,
    }
}

// ---------------------------------------------------------------------------
// Integration tests — compute_reconciliation
// ---------------------------------------------------------------------------

/// Happy path: one credit line with a saved mapping + one eligible unsettled
/// group → auto-match produces BankStatementLineStatus::Matched.
#[tokio::test]
async fn compute_reconciliation_end_to_end_auto_match() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    insert_bank_account(&pool, "acc-1").await;
    insert_fund(&pool, "fund-1", "93", "CPAM 93").await;
    insert_label_mapping(&pool, "map-1", "acc-1", "CPAM93", Some("fund-1")).await;
    insert_fund_payment_group(&pool, "group-1", "fund-1", "2026-01-15", 100_000, "ACTIVE").await;

    let parse_result = parse_result_with_one_line("CPAM93", "2026-01-15", 100_000);

    let reconciliation = ctx
        .orchestrator
        .compute_reconciliation("acc-1", &parse_result, &[])
        .await
        .unwrap();

    assert_eq!(reconciliation.lines.len(), 1);
    assert_eq!(
        reconciliation.lines[0].status,
        BankStatementLineStatus::Matched,
        "saved mapping + eligible group → auto-match → Matched (BAS-050–054)"
    );
    assert_eq!(reconciliation.resolved_count, 1);
    assert_eq!(reconciliation.needs_correction_count, 0);
}

/// LinkFund cascade end-to-end: two lines for the same label, one eligible
/// group (exact amount match for the first line). After the correction, the
/// first line should be Matched and the second line should have fund_id set.
#[tokio::test]
async fn compute_reconciliation_link_fund_cascade_end_to_end() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    insert_bank_account(&pool, "acc-1").await;
    insert_fund(&pool, "fund-1", "93", "CPAM 93").await;
    // No saved mapping — label starts as NeedsLink.
    insert_fund_payment_group(&pool, "group-1", "fund-1", "2026-01-15", 100_000, "ACTIVE").await;

    let parse_result = BankStatementParseResult {
        iban: None,
        period: None,
        credit_lines: vec![
            BankStatementCreditLine {
                date: "2026-01-15".to_string(),
                label: "CPAM93".to_string(),
                amount: 100_000,
            },
            BankStatementCreditLine {
                date: "2026-01-20".to_string(),
                label: "CPAM93".to_string(),
                amount: 50_000,
            },
        ],
        total_credits: 150_000,
        unparsed_count: 0,
    };

    let corrections = vec![BankStatementCorrection::LinkFund {
        bank_label: "CPAM93".to_string(),
        assignment: FundAssignment::Fund {
            fund_id: "fund-1".to_string(),
        },
    }];

    let reconciliation = ctx
        .orchestrator
        .compute_reconciliation("acc-1", &parse_result, &corrections)
        .await
        .unwrap();

    assert_eq!(reconciliation.lines.len(), 2);
    // Both lines must now know their fund (BAS-066 cascade).
    for line in &reconciliation.lines {
        assert_eq!(
            line.fund_id.as_deref(),
            Some("fund-1"),
            "link-fund cascade must set fund on all lines sharing the label (BAS-066)"
        );
    }
    // Line 0 (100_000) matches group-1 → Matched.
    assert_eq!(
        reconciliation.lines[0].status,
        BankStatementLineStatus::Matched
    );
}

/// Error propagation: assigning a locked group returns GroupNotEligible
/// through the full stack.
#[tokio::test]
async fn compute_reconciliation_group_not_eligible_propagates() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    insert_bank_account(&pool, "acc-1").await;
    insert_fund(&pool, "fund-1", "93", "CPAM 93").await;
    insert_label_mapping(&pool, "map-1", "acc-1", "CPAM93", Some("fund-1")).await;
    // BankPaid group = locked → ineligible for assignment (BAS-090).
    insert_fund_payment_group(
        &pool,
        "group-locked",
        "fund-1",
        "2026-01-15",
        100_000,
        "BANK_PAYED",
    )
    .await;

    let parse_result = parse_result_with_one_line("CPAM93", "2026-01-15", 100_000);
    let corrections = vec![BankStatementCorrection::AssignGroups {
        line_id: "line-0".to_string(),
        group_ids: vec!["group-locked".to_string()],
    }];

    let result = ctx
        .orchestrator
        .compute_reconciliation("acc-1", &parse_result, &corrections)
        .await;

    assert!(
        matches!(
            result,
            Err(BankStatementReconciliationError::Task(
                BankStatementReconciliationTask::GroupNotEligible
            ))
        ),
        "assigning a locked group must propagate GroupNotEligible (BAS-090)"
    );
}

// ---------------------------------------------------------------------------
// Integration tests — validate_reconciliation
// ---------------------------------------------------------------------------

/// Happy path: one auto-matched line → 1 BankEntry created.
#[tokio::test]
async fn validate_reconciliation_end_to_end() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    insert_bank_account(&pool, "acc-1").await;
    insert_fund(&pool, "fund-1", "93", "CPAM 93").await;
    insert_label_mapping(&pool, "map-1", "acc-1", "CPAM93", Some("fund-1")).await;
    insert_fund_payment_group(&pool, "group-1", "fund-1", "2026-01-15", 100_000, "ACTIVE").await;

    let parse_result = parse_result_with_one_line("CPAM93", "2026-01-15", 100_000);

    let count = ctx
        .orchestrator
        .validate_reconciliation("acc-1", &parse_result, &[])
        .await
        .unwrap();

    assert_eq!(count, 1, "one auto-matched line → 1 BankEntry (BAS-070)");
}

/// N groups on one line → N BankEntry records (BAS-093).
#[tokio::test]
async fn validate_reconciliation_multi_group_n_entries() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    insert_bank_account(&pool, "acc-1").await;
    insert_fund(&pool, "fund-1", "93", "CPAM 93").await;
    insert_label_mapping(&pool, "map-1", "acc-1", "CPAM93", Some("fund-1")).await;
    // Two groups summing to the line amount.
    insert_fund_payment_group(&pool, "group-a", "fund-1", "2026-01-10", 60_000, "ACTIVE").await;
    insert_fund_payment_group(&pool, "group-b", "fund-1", "2026-01-12", 40_000, "ACTIVE").await;

    let parse_result = parse_result_with_one_line("CPAM93", "2026-01-15", 100_000);

    // Explicitly assign both groups (auto-match only does 1:1 exact; we need
    // multi-group explicit assignment here).
    let corrections = vec![BankStatementCorrection::AssignGroups {
        line_id: "line-0".to_string(),
        group_ids: vec!["group-a".to_string(), "group-b".to_string()],
    }];

    let count = ctx
        .orchestrator
        .validate_reconciliation("acc-1", &parse_result, &corrections)
        .await
        .unwrap();

    assert_eq!(
        count, 2,
        "two groups on one line → 2 BankEntry records (BAS-093)"
    );
}
