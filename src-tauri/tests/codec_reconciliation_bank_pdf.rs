#![cfg(feature = "dev-fixtures")]
//! Full-pipeline integration test for bank-statement reconciliation, driven by
//! the committed `happy_path_multi_label` bank-PDF fixture.
//!
//! Spec: docs/spec/import-codec-fixtures.md (IFC-050/051) + the BAS-050–094
//! reconciliation rules.
//!
//! # What this covers
//!
//! Unlike `bank_statement_reconciliation_crud.rs` — which feeds hand-built
//! `BankStatementParseResult` values into the orchestrator — this test drives
//! the *real* parse → reconcile → validate pipeline:
//!
//!   1. extract text from the committed `.pdf` (production extractor)
//!   2. parse it with the production parser → `BankStatementParseResult`
//!      (asserted equal to the committed `.expected.json` as a sanity anchor)
//!   3. seed real SQLite repos (account / funds / label mappings / groups)
//!   4. `compute_reconciliation` → assert every line's status (BAS-061)
//!   5. apply `LinkFund` + `AssignGroups` corrections → recompute → assert the
//!      cascade resolved them (BAS-066/090/091)
//!   6. `validate_reconciliation` → assert the BankEntry count and that the
//!      settled groups are locked (BankPaid) by querying the DB.
//!
//! # Feature gate
//!
//! `#![cfg(feature = "dev-fixtures")]` (IFC-051) — standard `cargo test` skips
//! this file entirely; only the dev-fixtures CI job enables the feature.

mod common;

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
    shared::pdf_extractor::extract_pdf_text,
    use_cases::bank_statement_reconciliation::{
        parser,
        reconciliation::{BankStatementCorrection, BankStatementLineStatus, FundAssignment},
        BankStatementOrchestrator, SqliteBankFundLabelMappingRepository,
    },
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

// ---------------------------------------------------------------------------
// Fixture data — must stay in sync with
// tests/fixtures/bank_pdf/happy_path_multi_label.expected.json. The round-trip
// assertion in `seed_and_parse_fixture` guards against drift.
// ---------------------------------------------------------------------------

const FIXTURE_IBAN: &str = "FR7600000000000000000000000";

// Line 0 — mapped + exact group → auto-matched (Matched).
const LABEL_CPAM01: &str = "CPAM01";
const DATE_CPAM01: &str = "2025-05-02";
const AMOUNT_CPAM01: i64 = 100_000;

// Line 1 — unmapped → NeedsLink, then LinkFund correction resolves it.
const LABEL_MUTUELLE: &str = "MUTUELLEGENERALEEDUCATIONNAT";

// Line 2 — mapped to a fund with candidate (non-exact) groups → NeedsGroup,
// then AssignGroups correction resolves it to Matched.
const LABEL_HDS: &str = "CPAMHAUTSDESEINE";
const AMOUNT_HDS: i64 = 75_000;

const FUND_CPAM01: &str = "fund-cpam01";
const FUND_MUTUELLE: &str = "fund-mutuelle";
const FUND_HDS: &str = "fund-hds";

const ACCOUNT_ID: &str = "acc-1";

// ---------------------------------------------------------------------------
// Infrastructure helpers (mirrors bank_statement_reconciliation_crud.rs)
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
    orchestrator: Arc<BankStatementOrchestrator>,
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

    let orchestrator = Arc::new(BankStatementOrchestrator::new(
        bank_account_service,
        fund_service,
        fund_payment_service,
        bank_entry_service,
        transfer_link_repo,
        procedure_service,
        label_mapping_repo,
        bus,
    ));

    Ctx { orchestrator }
}

// ---------------------------------------------------------------------------
// DB seed helpers — runtime (non-macro) sqlx, project runs SQLX_OFFLINE=true.
// ---------------------------------------------------------------------------

async fn insert_bank_account_with_iban(pool: &SqlitePool, id: &str, iban: &str) {
    sqlx::query(
        "INSERT INTO bank_account (id, name, iban, is_deleted) VALUES (?, 'Test Bank', ?, 0)",
    )
    .bind(id)
    .bind(iban)
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

/// Read a group's persisted status string straight from the DB (used to assert
/// post-validate locking without depending on the domain read path).
async fn read_group_status(pool: &SqlitePool, id: &str) -> String {
    sqlx::query_scalar::<_, String>("SELECT status FROM fund_payment_group WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .expect("read group status")
}

/// Count bank_transfer rows for an account (one BankEntry per settled group).
async fn count_bank_transfers(pool: &SqlitePool, account_id: &str) -> i64 {
    sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM bank_transfer WHERE bank_account_id = ?")
        .bind(account_id)
        .fetch_one(pool)
        .await
        .expect("count bank_transfer")
}

// ---------------------------------------------------------------------------
// Seeding — produces the realistic three-line scenario the fixture supports.
// ---------------------------------------------------------------------------

/// Seed the DB so each fixture line lands on a distinct status:
/// - CPAM01  → mapping + exact eligible group        → Matched (auto-match)
/// - MUTUELLE → no mapping                            → NeedsLink
/// - HDS      → mapping + two non-exact candidate groups (within tolerance,
///              each < line amount) → NeedsGroup (a candidate exists but no
///              exact-amount group, so auto-match cannot fire).
async fn seed_scenario(pool: &SqlitePool) {
    insert_bank_account_with_iban(pool, ACCOUNT_ID, FIXTURE_IBAN).await;

    insert_fund(pool, FUND_CPAM01, "01", "CPAM 01").await;
    insert_fund(pool, FUND_MUTUELLE, "MGEN", "Mutuelle Generale").await;
    insert_fund(pool, FUND_HDS, "92", "CPAM Hauts-de-Seine").await;

    // CPAM01 mapped; MUTUELLE intentionally left unmapped (NeedsLink).
    insert_label_mapping(
        pool,
        "map-cpam01",
        ACCOUNT_ID,
        LABEL_CPAM01,
        Some(FUND_CPAM01),
    )
    .await;
    insert_label_mapping(pool, "map-hds", ACCOUNT_ID, LABEL_HDS, Some(FUND_HDS)).await;

    // CPAM01: exact amount + same-day date → auto-matches the line.
    insert_fund_payment_group(
        pool,
        "group-cpam01",
        FUND_CPAM01,
        DATE_CPAM01,
        AMOUNT_CPAM01,
        "ACTIVE",
    )
    .await;

    // HDS: two candidate groups, neither equal to the 75_000 line amount so
    // auto-match cannot fire, but both within the 7-day tolerance and ≤ the
    // outstanding amount, so they surface as candidates → NeedsGroup. Their
    // sum (70_000 + 5_000) == 75_000 so an explicit AssignGroups reaches Matched.
    insert_fund_payment_group(
        pool,
        "group-hds-a",
        FUND_HDS,
        "2025-05-18",
        70_000,
        "ACTIVE",
    )
    .await;
    insert_fund_payment_group(pool, "group-hds-b", FUND_HDS, "2025-05-19", 5_000, "ACTIVE").await;
}

/// Load the fixture, run the production extract → parse pipeline, and assert the
/// parsed result equals the committed snapshot (drift anchor, mirrors the
/// round-trip test).
fn parse_fixture()
-> patient_manager_app::use_cases::bank_statement_reconciliation::bank_pdf_codec::BankStatementParseResult
{
    let (pdf_path, expected) = common::fixtures::bank_pdf::happy_path_multi_label();
    let extracted = extract_pdf_text(&pdf_path)
        .expect("text extraction must succeed on a committed fixture PDF");
    let parsed = parser::parse_bank_statement(&extracted);
    assert_eq!(
        expected, parsed,
        "fixture drift: parse(extract_text(fixture)) must equal the committed expected.json — \
         re-run `just regen-fixtures bank-pdf` if the scenario changed"
    );
    parsed
}

fn status_of<'a>(
    reconciliation: &'a patient_manager_app::use_cases::bank_statement_reconciliation::reconciliation::BankStatementReconciliation,
    label: &str,
) -> &'a BankStatementLineStatus {
    &reconciliation
        .lines
        .iter()
        .find(|l| l.credit_line.label == label)
        .unwrap_or_else(|| panic!("no reconciliation line for label {label}"))
        .status
}

fn line_id_of(
    reconciliation: &patient_manager_app::use_cases::bank_statement_reconciliation::reconciliation::BankStatementReconciliation,
    label: &str,
) -> String {
    reconciliation
        .lines
        .iter()
        .find(|l| l.credit_line.label == label)
        .unwrap_or_else(|| panic!("no reconciliation line for label {label}"))
        .line_id
        .clone()
}

// ===========================================================================
// Tests
// ===========================================================================

/// Initial pass (no corrections): each fixture line lands on its seeded status.
#[tokio::test]
async fn initial_reconciliation_assigns_expected_statuses_per_fixture_line() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);
    seed_scenario(&pool).await;

    let parse_result = parse_fixture();

    let reconciliation = ctx
        .orchestrator
        .compute_reconciliation(ACCOUNT_ID, &parse_result, &[])
        .await
        .expect("compute_reconciliation must succeed on the seeded fixture");

    assert_eq!(
        reconciliation.lines.len(),
        3,
        "fixture has three credit lines"
    );

    assert_eq!(
        status_of(&reconciliation, LABEL_CPAM01),
        &BankStatementLineStatus::Matched,
        "CPAM01: saved mapping + exact eligible group → auto-match → Matched (BAS-050–054)"
    );
    assert_eq!(
        status_of(&reconciliation, LABEL_MUTUELLE),
        &BankStatementLineStatus::NeedsLink,
        "MUTUELLE: no saved mapping → NeedsLink (BAS-061)"
    );
    assert_eq!(
        status_of(&reconciliation, LABEL_HDS),
        &BankStatementLineStatus::NeedsGroup,
        "HDS: mapped fund + candidate groups, none exact → NeedsGroup (BAS-061)"
    );

    // One Matched line is resolved; the other two need correction.
    assert_eq!(reconciliation.resolved_count, 1);
    assert_eq!(reconciliation.needs_correction_count, 2);
}

/// LinkFund + AssignGroups corrections cascade-resolve the two open lines.
#[tokio::test]
async fn corrections_resolve_needs_link_and_needs_group_lines() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);
    seed_scenario(&pool).await;

    let parse_result = parse_fixture();

    // Discover the engine-assigned line id for the HDS line before correcting.
    let initial = ctx
        .orchestrator
        .compute_reconciliation(ACCOUNT_ID, &parse_result, &[])
        .await
        .expect("initial compute must succeed");
    let hds_line_id = line_id_of(&initial, LABEL_HDS);

    let corrections = vec![
        // Link the unmapped MUTUELLE label to its fund (BAS-066).
        BankStatementCorrection::LinkFund {
            bank_label: LABEL_MUTUELLE.to_string(),
            assignment: FundAssignment::Fund {
                fund_id: FUND_MUTUELLE.to_string(),
            },
        },
        // Cover the HDS line by assigning both candidate groups (70k + 5k = 75k).
        BankStatementCorrection::AssignGroups {
            line_id: hds_line_id,
            group_ids: vec!["group-hds-a".to_string(), "group-hds-b".to_string()],
        },
    ];

    let reconciliation = ctx
        .orchestrator
        .compute_reconciliation(ACCOUNT_ID, &parse_result, &corrections)
        .await
        .expect("compute_reconciliation with corrections must succeed");

    // MUTUELLE now knows its fund. The fixture seeds no eligible group for that
    // fund, so without exact/candidate groups it is NeedsGroup or Unresolved —
    // either way the NeedsLink state is gone (cascade applied, BAS-066).
    let mutuelle_status = status_of(&reconciliation, LABEL_MUTUELLE);
    assert_ne!(
        mutuelle_status,
        &BankStatementLineStatus::NeedsLink,
        "LinkFund cascade must move MUTUELLE off NeedsLink (BAS-066)"
    );
    let mutuelle_fund = reconciliation
        .lines
        .iter()
        .find(|l| l.credit_line.label == LABEL_MUTUELLE)
        .and_then(|l| l.fund_id.clone());
    assert_eq!(
        mutuelle_fund.as_deref(),
        Some(FUND_MUTUELLE),
        "LinkFund must set fund_id on the MUTUELLE line (BAS-066)"
    );

    // HDS is fully covered by the two assigned groups → Matched (BAS-090/091).
    let hds_line = reconciliation
        .lines
        .iter()
        .find(|l| l.credit_line.label == LABEL_HDS)
        .expect("HDS line present");
    assert_eq!(hds_line.covered_amount, AMOUNT_HDS);
    assert_eq!(
        hds_line.status,
        BankStatementLineStatus::Matched,
        "two assigned groups summing to the line amount → Matched (BAS-090/091)"
    );

    // CPAM01 stays auto-matched.
    assert_eq!(
        status_of(&reconciliation, LABEL_CPAM01),
        &BankStatementLineStatus::Matched,
        "CPAM01 remains auto-matched after unrelated corrections"
    );
}

/// Validate commits the reconciliation: one BankEntry per settled group and the
/// settled groups are locked to BankPaid in the DB.
#[tokio::test]
async fn validate_creates_entries_and_locks_settled_groups() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);
    seed_scenario(&pool).await;

    let parse_result = parse_fixture();

    let initial = ctx
        .orchestrator
        .compute_reconciliation(ACCOUNT_ID, &parse_result, &[])
        .await
        .expect("initial compute must succeed");
    let hds_line_id = line_id_of(&initial, LABEL_HDS);

    let corrections = vec![
        BankStatementCorrection::LinkFund {
            bank_label: LABEL_MUTUELLE.to_string(),
            assignment: FundAssignment::Fund {
                fund_id: FUND_MUTUELLE.to_string(),
            },
        },
        BankStatementCorrection::AssignGroups {
            line_id: hds_line_id,
            group_ids: vec!["group-hds-a".to_string(), "group-hds-b".to_string()],
        },
    ];

    // Pre-condition: nothing settled yet.
    assert_eq!(count_bank_transfers(&pool, ACCOUNT_ID).await, 0);

    let created = ctx
        .orchestrator
        .validate_reconciliation(ACCOUNT_ID, &parse_result, &corrections)
        .await
        .expect("validate_reconciliation must succeed");

    // Three settled groups → three BankEntry records (BAS-093):
    //   CPAM01 → group-cpam01 (1)
    //   HDS    → group-hds-a + group-hds-b (2)
    // MUTUELLE has no assigned group, so it contributes none.
    assert_eq!(
        created, 3,
        "one BankEntry per assigned group on every Matched line (BAS-093)"
    );
    assert_eq!(
        count_bank_transfers(&pool, ACCOUNT_ID).await,
        3,
        "three bank_transfer rows persisted for the settled groups"
    );

    // Every settled group is now locked to BankPaid (BAS-072/073).
    for group_id in ["group-cpam01", "group-hds-a", "group-hds-b"] {
        assert_eq!(
            read_group_status(&pool, group_id).await,
            "BANK_PAYED",
            "{group_id} must be locked to BankPaid after validate"
        );
    }
}
