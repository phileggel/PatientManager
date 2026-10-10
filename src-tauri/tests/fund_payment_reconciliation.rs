/// Integration tests for the fund payment reconciliation feature.
///
/// Tests go through the public API functions (thin wrappers) exactly as the
/// frontend would — starting from the same input types and calling the same
/// entry points, without any Tauri State boilerplate.
///
/// # Scenarios
///
/// 1. `test_full_reconciliation_scenario_with_amount_correction`
///    Direct orchestrator path (no reconciliation service):
///    candidates + AmountMismatch → 2 groups created, 5 procedures Reconciled.
///
/// 2. `test_full_chain_via_reconciliation_service`
///    Full chain from PdfParseResult (French dates, raw PDF format):
///    parse result → reconcile_and_create_candidates_fn → create_fund_payment_with_auto_corrections_fn
///    Validates the entire pipeline from PDF input to persisted fund payment groups.
use std::sync::Arc;

use patient_manager_app::{
    context::{
        fund::{
            FundPaymentService, FundService, SqliteFundPaymentRepository, SqliteFundRepository,
        },
        patient::{PatientService, SqlitePatientRepository},
        procedure::{
            PaymentMethod, ProcedureService, ProcedureStatus, ProcedureTypeService,
            SqliteProcedureRepository, SqliteProcedureTypeRepository,
        },
    },
    shared::event_bus::EventBus,
    use_cases::fund_payment_reconciliation::{
        api::{
            create_fund_payment_from_candidates_fn, create_fund_payment_with_auto_corrections_fn,
            reconcile_and_create_candidates_fn, reconcile_pdf_procedures_fn,
        },
        AutoCorrection, CreateFundPaymentFromCandidatesRequest,
        CreateFundPaymentWithAutoCorrectionsRequest, FundPaymentReconciliationOrchestrator,
        NormalizedPdfLine, PdfParseResult, PdfProcedureGroup, ReconciliationService,
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
    orchestrator: Arc<FundPaymentReconciliationOrchestrator>,
    reconciliation_service: Arc<ReconciliationService>,
    patient_service: Arc<PatientService>,
    procedure_service: Arc<ProcedureService>,
    procedure_type_service: Arc<ProcedureTypeService>,
    fund_service: Arc<FundService>,
}

fn build_ctx(pool: &SqlitePool) -> Ctx {
    let bus = Arc::new(EventBus::new());

    let fund_repo = Arc::new(SqliteFundRepository::new(pool.clone()));
    let fund_service = Arc::new(FundService::new(fund_repo.clone(), bus.clone()));

    let fp_repo = Arc::new(SqliteFundPaymentRepository::new(pool.clone()));
    let fund_payment_service = Arc::new(FundPaymentService::new(fp_repo, bus.clone()));

    let proc_repo = Arc::new(SqliteProcedureRepository::new(pool.clone()));
    let procedure_service = Arc::new(ProcedureService::new(proc_repo.clone(), bus.clone()));

    let patient_repo = Arc::new(SqlitePatientRepository::new(pool.clone()));
    let patient_service = Arc::new(PatientService::new(patient_repo, bus.clone()));

    let pt_repo = Arc::new(SqliteProcedureTypeRepository::new(pool.clone()));
    let procedure_type_service = Arc::new(ProcedureTypeService::new(pt_repo, bus.clone()));

    let reconciliation_service = Arc::new(ReconciliationService::new(
        proc_repo.clone(),
        fund_repo.clone(),
    ));

    let orchestrator = Arc::new(FundPaymentReconciliationOrchestrator::new(
        fund_service.clone(),
        procedure_service.clone(),
        fund_payment_service,
        bus,
    ));

    Ctx {
        orchestrator,
        reconciliation_service,
        patient_service,
        procedure_service,
        procedure_type_service,
        fund_service,
    }
}

// ---------------------------------------------------------------------------
// Scenario 1 — Direct orchestrator path with AmountMismatch correction
//
// 2 patients · 2 funds · 5 procedures
// Calls create_fund_payment_with_auto_corrections_fn directly with pre-built candidates.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_full_reconciliation_scenario_with_amount_correction() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    // ---- Seed: procedure type ------------------------------------------
    let pt = ctx
        .procedure_type_service
        .add_procedure_type("SF".to_string(), 0, None)
        .await
        .unwrap();

    // ---- Seed: patients ------------------------------------------------
    let alice = ctx
        .patient_service
        .create_patient(
            Some("Alice DUPONT".to_string()),
            Some("1234567890123".to_string()),
        )
        .await
        .unwrap();
    let bob = ctx
        .patient_service
        .create_patient(
            Some("Bob MARTIN".to_string()),
            Some("9876543210987".to_string()),
        )
        .await
        .unwrap();

    // ---- Seed: funds ---------------------------------------------------
    let cpam = ctx
        .fund_service
        .create_fund("931".to_string(), "CPAM n° 931".to_string())
        .await
        .unwrap();
    let mgen = ctx
        .fund_service
        .create_fund("MGEN".to_string(), "MGEN".to_string())
        .await
        .unwrap();

    // ---- Seed: procedures (amounts in millièmes) -----------------------
    let seed = |patient_id: String, fund_id: String, date: &str, amount: i64| {
        let svc = ctx.procedure_service.clone();
        let pt_id = pt.id.clone();
        let date = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap();
        async move {
            svc.create_procedure(
                patient_id,
                Some(fund_id),
                pt_id,
                date,
                amount,
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap()
        }
    };

    let p1 = seed(alice.id.clone(), cpam.id.clone(), "2025-04-01", 38_400).await;
    let p2 = seed(alice.id.clone(), cpam.id.clone(), "2025-04-15", 52_000).await;
    let p3 = seed(bob.id.clone(), cpam.id.clone(), "2025-04-10", 45_000).await;
    let p4 = seed(bob.id.clone(), mgen.id.clone(), "2025-04-20", 30_000).await;
    // p5: DB has 25 000, PDF says 28 500 → AmountMismatch
    let p5 = seed(alice.id.clone(), mgen.id.clone(), "2025-04-25", 25_000).await;

    let payment_date = chrono::NaiveDate::from_ymd_opt(2025, 5, 2).unwrap();

    // ---- Build request -----------------------------------------------
    let request = CreateFundPaymentWithAutoCorrectionsRequest {
        candidates: vec![
            patient_manager_app::context::fund::FundPaymentGroupCandidate {
                fund_label: "CPAM n° 931".to_string(),
                payment_date,
                total_amount: 135_400, // 38 400 + 52 000 + 45 000
                procedure_ids: vec![p1.id.clone(), p2.id.clone(), p3.id.clone()],
                matched_amount: 135_400,
                is_fully_covered: true,
            },
            patient_manager_app::context::fund::FundPaymentGroupCandidate {
                fund_label: "MGEN".to_string(),
                payment_date,
                total_amount: 58_500, // 30 000 + 28 500 (after correction)
                procedure_ids: vec![p4.id.clone(), p5.id.clone()],
                matched_amount: 55_000,
                is_fully_covered: false,
            },
        ],
        auto_corrections: vec![AutoCorrection::AmountMismatch {
            procedure_id: p5.id.clone(),
            pdf_amount: 28_500,
        }],
    };

    // ---- Act -----------------------------------------------------------
    let groups = create_fund_payment_with_auto_corrections_fn(
        request,
        ctx.patient_service.clone(),
        ctx.orchestrator.clone(),
    )
    .await
    .unwrap();

    // ---- Assert: 2 groups --------------------------------------------
    assert_eq!(groups.len(), 2);
    let cpam_group = groups.iter().find(|g| g.total_amount == 135_400).unwrap();
    let mgen_group = groups.iter().find(|g| g.total_amount == 58_500).unwrap();
    assert_eq!(cpam_group.lines.len(), 3);
    assert_eq!(mgen_group.lines.len(), 2);

    // ---- Assert: all procedures Reconciled -------------------------
    let procedures = ctx
        .procedure_service
        .read_procedures_by_ids(vec![
            p1.id.clone(),
            p2.id.clone(),
            p3.id.clone(),
            p4.id.clone(),
            p5.id.clone(),
        ])
        .await
        .unwrap();

    assert_eq!(procedures.len(), 5);
    for proc in &procedures {
        assert_eq!(proc.payment_status, ProcedureStatus::Reconciled);
    }

    // ---- Assert: p5 amount corrected in DB ---------------------------
    let p5_db = procedures.iter().find(|p| p.id == p5.id).unwrap();
    assert_eq!(p5_db.billed_amount, 28_500);

    // ---- Assert: duplicate guard -------------------------------------
    let dup = create_fund_payment_with_auto_corrections_fn(
        CreateFundPaymentWithAutoCorrectionsRequest {
            candidates: vec![
                patient_manager_app::context::fund::FundPaymentGroupCandidate {
                    fund_label: "CPAM n° 931".to_string(),
                    payment_date,
                    total_amount: 135_400,
                    procedure_ids: vec![p1.id.clone()],
                    matched_amount: 135_400,
                    is_fully_covered: true,
                },
            ],
            auto_corrections: vec![],
        },
        ctx.patient_service.clone(),
        ctx.orchestrator.clone(),
    )
    .await;
    assert!(
        dup.is_err(),
        "Re-submitting an already-processed group should fail"
    );
}

// ---------------------------------------------------------------------------
// Scenario 2 — Full chain from PdfParseResult (raw PDF format, French dates)
//
// 2 patients · 2 funds · 3 procedures
// Entry point: reconcile_and_create_candidates_fn (same as frontend call)
// then create_fund_payment_with_auto_corrections_fn
//
// This is the critical regression test for the PdfLineNormalizer refactoring:
// French dates in PdfParseResult must flow correctly through the entire chain.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_full_chain_via_reconciliation_service() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    // ---- Seed: procedure type ------------------------------------------
    let pt = ctx
        .procedure_type_service
        .add_procedure_type("SF".to_string(), 0, None)
        .await
        .unwrap();

    // ---- Seed: patients ------------------------------------------------
    let alice = ctx
        .patient_service
        .create_patient(
            Some("Alice DUPONT".to_string()),
            Some("1111111111111".to_string()),
        )
        .await
        .unwrap();
    let bob = ctx
        .patient_service
        .create_patient(
            Some("Bob MARTIN".to_string()),
            Some("2222222222222".to_string()),
        )
        .await
        .unwrap();

    // ---- Seed: funds ---------------------------------------------------
    // The reconciliation service matches fund by identifier extracted from label
    ctx.fund_service
        .create_fund("931".to_string(), "CPAM n° 931".to_string())
        .await
        .unwrap();
    ctx.fund_service
        .create_fund("MGEN".to_string(), "MGEN".to_string())
        .await
        .unwrap();

    // We also need the fund IDs to seed procedures
    let cpam = ctx
        .fund_service
        .find_fund_by_identifier("931")
        .await
        .unwrap()
        .unwrap();
    let mgen = ctx
        .fund_service
        .find_fund_by_identifier("MGEN")
        .await
        .unwrap()
        .unwrap();

    // ---- Seed: procedures ---------------------------------------------
    // p1: Alice, CPAM, 2025-04-01, 38 400 — will be PerfectSingleMatch
    let p1 = ctx
        .procedure_service
        .create_procedure(
            alice.id.clone(),
            Some(cpam.id.clone()),
            pt.id.clone(),
            chrono::NaiveDate::from_ymd_opt(2025, 4, 1).unwrap(),
            38_400,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();

    // p2: Bob, CPAM, 2025-04-15, 52 000 — will be PerfectSingleMatch
    let p2 = ctx
        .procedure_service
        .create_procedure(
            bob.id.clone(),
            Some(cpam.id.clone()),
            pt.id.clone(),
            chrono::NaiveDate::from_ymd_opt(2025, 4, 15).unwrap(),
            52_000,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();

    // p3: Alice, MGEN, 2025-04-10, DB=25 000 but PDF=28 500 → SingleMatchIssue (AmountMismatch)
    let p3 = ctx
        .procedure_service
        .create_procedure(
            alice.id.clone(),
            Some(mgen.id.clone()),
            pt.id.clone(),
            chrono::NaiveDate::from_ymd_opt(2025, 4, 10).unwrap(),
            25_000,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();

    // ---- Build PdfParseResult (normalized format with NaiveDate) ----------
    //
    // This simulates what PdfParser produces from a real PDF after normalization:
    //   - payment_date, procedure_start_date, procedure_end_date are NaiveDate
    //   - ssn must match patient SSN in DB for the reconciliation to match
    let payment_date = chrono::NaiveDate::from_ymd_opt(2025, 5, 2).unwrap();
    let parse_result = PdfParseResult {
        groups: vec![
            PdfProcedureGroup {
                fund_label: "CPAM n° 931".to_string(),
                fund_full_name: "Caisse Primaire d'Assurance Maladie".to_string(),
                payment_date,
                total_amount: 90_400, // 38 400 + 52 000
                is_total_valid: true,
                lines: vec![
                    NormalizedPdfLine {
                        line_index: 0,
                        payment_date,
                        invoice_number: "001".to_string(),
                        fund_name: "CPAM n° 931".to_string(),
                        patient_name: "DUPONT ALICE".to_string(),
                        ssn: "1111111111111".to_string(),
                        nature: "SF".to_string(),
                        procedure_start_date: chrono::NaiveDate::from_ymd_opt(2025, 4, 1).unwrap(),
                        procedure_end_date: chrono::NaiveDate::from_ymd_opt(2025, 4, 1).unwrap(),
                        is_period: false,
                        amount: 38_400,
                    },
                    NormalizedPdfLine {
                        line_index: 1,
                        payment_date,
                        invoice_number: "002".to_string(),
                        fund_name: "CPAM n° 931".to_string(),
                        patient_name: "MARTIN BOB".to_string(),
                        ssn: "2222222222222".to_string(),
                        nature: "SF".to_string(),
                        procedure_start_date: chrono::NaiveDate::from_ymd_opt(2025, 4, 15).unwrap(),
                        procedure_end_date: chrono::NaiveDate::from_ymd_opt(2025, 4, 15).unwrap(),
                        is_period: false,
                        amount: 52_000,
                    },
                ],
            },
            PdfProcedureGroup {
                fund_label: "MGEN".to_string(),
                fund_full_name: "Mutuelle Générale de l'Education Nationale".to_string(),
                payment_date,
                total_amount: 28_500, // PDF says 28 500, DB has 25 000
                is_total_valid: true,
                lines: vec![NormalizedPdfLine {
                    line_index: 2,
                    payment_date,
                    invoice_number: "003".to_string(),
                    fund_name: "MGEN".to_string(),
                    patient_name: "DUPONT ALICE".to_string(),
                    ssn: "1111111111111".to_string(),
                    nature: "SF".to_string(),
                    procedure_start_date: chrono::NaiveDate::from_ymd_opt(2025, 4, 10).unwrap(),
                    procedure_end_date: chrono::NaiveDate::from_ymd_opt(2025, 4, 10).unwrap(),
                    is_period: false,
                    amount: 28_500,
                }],
            },
        ],
        unparsed_line_count: 0,
        unparsed_lines: vec![],
    };

    // ---- Step 1: reconcile (same call as frontend) --------------------
    let reconcile_response = reconcile_and_create_candidates_fn(
        parse_result,
        ctx.reconciliation_service.clone(),
        ctx.orchestrator.clone(),
    )
    .await
    .unwrap();

    // Assert reconciliation result: 2 perfect + 1 issue
    assert_eq!(reconcile_response.reconciliation.matches.len(), 3);

    let perfect_count = reconcile_response
        .reconciliation
        .matches
        .iter()
        .filter(|m| {
            matches!(
                m,
                patient_manager_app::use_cases::fund_payment_reconciliation::ReconciliationMatch::PerfectSingleMatch { .. }
            )
        })
        .count();
    assert_eq!(perfect_count, 2, "p1 and p2 should be PerfectSingleMatch");

    let issue_count = reconcile_response.reconciliation.matches.len() - perfect_count;
    assert_eq!(issue_count, 1, "p3 should have an AmountMismatch issue");

    // Assert candidates produced: 2 groups
    assert_eq!(reconcile_response.candidates.len(), 2);

    // ---- Step 2: create fund payment with correction (same call as frontend) --
    let request = CreateFundPaymentWithAutoCorrectionsRequest {
        candidates: reconcile_response.candidates,
        auto_corrections: vec![AutoCorrection::AmountMismatch {
            procedure_id: p3.id.clone(),
            pdf_amount: 28_500,
        }],
    };

    let groups = create_fund_payment_with_auto_corrections_fn(
        request,
        ctx.patient_service.clone(),
        ctx.orchestrator.clone(),
    )
    .await
    .unwrap();

    // ---- Assert: 2 groups created ------------------------------------
    assert_eq!(groups.len(), 2);

    let cpam_group = groups.iter().find(|g| g.total_amount == 90_400).unwrap();
    let mgen_group = groups.iter().find(|g| g.total_amount == 28_500).unwrap();
    assert_eq!(cpam_group.lines.len(), 2);
    assert_eq!(mgen_group.lines.len(), 1);

    // ---- Assert: all 3 procedures Reconciled ----------------------
    let procedures = ctx
        .procedure_service
        .read_procedures_by_ids(vec![p1.id.clone(), p2.id.clone(), p3.id.clone()])
        .await
        .unwrap();

    assert_eq!(procedures.len(), 3);
    for proc in &procedures {
        assert_eq!(
            proc.payment_status,
            ProcedureStatus::Reconciled,
            "Procedure {} should be Reconciled",
            proc.id
        );
    }

    // ---- Assert: p3 amount corrected in DB ---------------------------
    let p3_db = procedures.iter().find(|p| p.id == p3.id).unwrap();
    assert_eq!(
        p3_db.billed_amount, 28_500,
        "p3 amount should be corrected from 25 000 to 28 500"
    );
}

// ---------------------------------------------------------------------------
// Scenario 3 — FPA-260 (R17) fund auto-creation branch
//
// The label `CPAM n° 75` extracts identifier `75`, which is not seeded.
// The orchestrator must auto-create the fund and then reconcile the
// candidate. The other Scenarios pre-seed every fund and therefore only
// cover the "existing fund found" branch of FPA-260.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_fund_payment_from_candidate_auto_creates_unknown_fund() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    let pt = ctx
        .procedure_type_service
        .add_procedure_type("SF".to_string(), 0, None)
        .await
        .unwrap();
    let patient = ctx
        .patient_service
        .create_patient(
            Some("Alice DUPONT".to_string()),
            Some("3333333333333".to_string()),
        )
        .await
        .unwrap();
    let proc = ctx
        .procedure_service
        .create_procedure(
            patient.id.clone(),
            None,
            pt.id.clone(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .unwrap();

    let group = ctx
        .orchestrator
        .create_fund_payment_from_candidate(
            "CPAM n° 75".to_string(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            100_000,
            vec![proc.id.clone()],
            Some(100_000),
        )
        .await
        .unwrap();

    assert_eq!(group.total_amount, 100_000);
    assert_eq!(group.lines.len(), 1);
    assert_eq!(group.lines[0].procedure_id, proc.id);

    let created_fund = ctx
        .fund_service
        .find_fund_by_identifier("75")
        .await
        .unwrap();
    assert!(
        created_fund.is_some(),
        "fund with identifier `75` should have been auto-created"
    );

    let procs = ctx
        .procedure_service
        .read_procedures_by_ids(vec![proc.id])
        .await
        .unwrap();
    assert!(matches!(
        procs[0].payment_status,
        ProcedureStatus::Reconciled
    ));
    assert_eq!(procs[0].paid_amount, Some(100_000));
}

// ---------------------------------------------------------------------------
// Scenario 4 — FPA-050 (R3) all-duplicates rejection
//
// Re-submitting the same fund/date/amount triple — even with a different
// procedure list — must be rejected with an "already exist" error.
// ---------------------------------------------------------------------------

#[tokio::test]
async fn create_multiple_from_candidates_all_duplicates_returns_error() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    let pt = ctx
        .procedure_type_service
        .add_procedure_type("SF".to_string(), 0, None)
        .await
        .unwrap();
    let patient = ctx
        .patient_service
        .create_patient(
            Some("Alice DUPONT".to_string()),
            Some("4444444444444".to_string()),
        )
        .await
        .unwrap();
    let fund = ctx
        .fund_service
        .create_fund("DUP".to_string(), "Duplicate Fund".to_string())
        .await
        .unwrap();

    let seed = |amount: i64| {
        let svc = ctx.procedure_service.clone();
        let pt_id = pt.id.clone();
        let patient_id = patient.id.clone();
        let fund_id = fund.id.clone();
        async move {
            svc.create_procedure(
                patient_id,
                Some(fund_id),
                pt_id,
                chrono::NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
                amount,
                PaymentMethod::None,
                None,
                None,
                None,
                ProcedureStatus::Created,
            )
            .await
            .unwrap()
        }
    };
    let proc_first = seed(100_000).await;
    let proc_second = seed(100_000).await;

    let payment_date = chrono::NaiveDate::from_ymd_opt(2026, 3, 1).unwrap();
    ctx.orchestrator
        .create_multiple_from_candidates(vec![
            patient_manager_app::context::fund::FundPaymentGroupCandidate {
                fund_label: "DUP".to_string(),
                payment_date,
                total_amount: 100_000,
                procedure_ids: vec![proc_first.id],
                matched_amount: 100_000,
                is_fully_covered: true,
            },
        ])
        .await
        .expect("first creation should succeed");

    let result = ctx
        .orchestrator
        .create_multiple_from_candidates(vec![
            patient_manager_app::context::fund::FundPaymentGroupCandidate {
                fund_label: "DUP".to_string(),
                payment_date,
                total_amount: 100_000,
                procedure_ids: vec![proc_second.id],
                matched_amount: 100_000,
                is_fully_covered: true,
            },
        ])
        .await;

    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("already exist"));
}

// ---------------------------------------------------------------------------
// A PDF whose text holds no payment line: the workflow refuses it instead of
// answering an empty result that the screen would show as "no anomaly".
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_fpa_065_a_pdf_with_no_pdf_line_is_refused_by_both_reconcile_commands() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);

    let err = reconcile_and_create_candidates_fn(
        PdfParseResult {
            groups: vec![],
            unparsed_line_count: 0,
            unparsed_lines: vec![],
        },
        ctx.reconciliation_service.clone(),
        ctx.orchestrator.clone(),
    )
    .await
    .expect_err("an empty PDF gives nothing to reconcile");
    let raw_err = reconcile_pdf_procedures_fn(
        PdfParseResult {
            groups: vec![],
            unparsed_line_count: 0,
            unparsed_lines: vec![],
        },
        ctx.reconciliation_service.clone(),
    )
    .await
    .expect_err("the raw reconciliation refuses it too");
    assert_eq!(
        serde_json::to_value(&raw_err).unwrap(),
        serde_json::json!({ "code": "PdfHasNoLine" }),
    );

    assert_eq!(
        serde_json::to_value(&err).unwrap(),
        serde_json::json!({ "code": "PdfHasNoLine" }),
    );
}

// ---------------------------------------------------------------------------
// A statement where the fund takes money back as a group of its own (total not
// positive): the group leaves the import, the rest is reconciled, and a
// validation that would still carry such a group writes nothing.
// ---------------------------------------------------------------------------

fn refund_statement_line(index: u32, fund: &str, amount: i64) -> NormalizedPdfLine {
    let date = chrono::NaiveDate::from_ymd_opt(2026, 8, 26).unwrap();
    NormalizedPdfLine {
        line_index: index,
        payment_date: date,
        invoice_number: format!("{index:03}"),
        fund_name: fund.to_string(),
        patient_name: "DUPONT ALICE".to_string(),
        ssn: "1111111111111".to_string(),
        nature: "SF".to_string(),
        procedure_start_date: date,
        procedure_end_date: date,
        is_period: false,
        amount,
    }
}

#[tokio::test]
async fn test_fpa_070_a_group_taken_back_by_the_fund_is_left_out_and_named() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);
    let payment_date = chrono::NaiveDate::from_ymd_opt(2026, 8, 26).unwrap();
    let group = |label: &str, total_amount: i64, lines: Vec<NormalizedPdfLine>| PdfProcedureGroup {
        fund_label: label.to_string(),
        fund_full_name: label.to_string(),
        payment_date,
        total_amount,
        is_total_valid: true,
        lines,
    };

    let response = reconcile_and_create_candidates_fn(
        PdfParseResult {
            groups: vec![
                group(
                    "CPAM n° 941",
                    38_400,
                    vec![refund_statement_line(0, "CPAM n° 941", 38_400)],
                ),
                group(
                    "CPAM n° 951",
                    -26_500,
                    vec![
                        refund_statement_line(1, "CPAM n° 951", -23_000),
                        refund_statement_line(2, "CPAM n° 951", -3_500),
                    ],
                ),
            ],
            unparsed_line_count: 0,
            unparsed_lines: vec![],
        },
        ctx.reconciliation_service.clone(),
        ctx.orchestrator.clone(),
    )
    .await
    .expect("the statement is reconciled without its refund group");

    assert_eq!(response.left_out_groups.len(), 1);
    assert_eq!(response.left_out_groups[0].fund_label, "CPAM n° 951");
    assert_eq!(response.left_out_groups[0].total_amount, -26_500);
    assert_eq!(response.candidates.len(), 1);
    assert_eq!(response.candidates[0].fund_label, "CPAM n° 941");
    // Only the line of the kept group is matched: nothing of the refund group asks for a correction.
    assert_eq!(response.reconciliation.matches.len(), 1);
}

#[tokio::test]
async fn test_fpa_075_a_validation_that_cannot_complete_writes_nothing() {
    let pool = setup_pool().await;
    let ctx = build_ctx(&pool);
    let payment_date = chrono::NaiveDate::from_ymd_opt(2026, 8, 26).unwrap();
    let candidate = |label: &str, total_amount: i64| {
        patient_manager_app::context::fund::FundPaymentGroupCandidate {
            fund_label: label.to_string(),
            payment_date,
            total_amount,
            procedure_ids: vec![],
            matched_amount: 0,
            is_fully_covered: false,
        }
    };
    let request = || CreateFundPaymentWithAutoCorrectionsRequest {
        candidates: vec![
            candidate("CPAM n° 941", 38_400),
            candidate("CPAM n° 951", -26_500),
        ],
        auto_corrections: vec![AutoCorrection::CreateProcedure {
            ssn: "1111111111111".to_string(),
            patient_name: "DUPONT ALICE".to_string(),
            procedure_date: payment_date,
            payment_date,
            billed_amount: 38_400,
            pdf_fund_label: "CPAM n° 941".to_string(),
        }],
    };

    // Twice, as a user who clicks again: no attempt may leave anything behind.
    for attempt in 1..=2 {
        let err = create_fund_payment_with_auto_corrections_fn(
            request(),
            ctx.patient_service.clone(),
            ctx.orchestrator.clone(),
        )
        .await
        .expect_err("a group with a negative total cannot be created");
        assert_eq!(
            serde_json::to_value(&err).unwrap(),
            serde_json::json!({ "code": "TotalAmountNotPositive" }),
            "attempt {attempt}"
        );
        let procedures = ctx.procedure_service.read_all_procedures().await.unwrap();
        assert!(
            procedures.is_empty(),
            "attempt {attempt} created {} procedure(s)",
            procedures.len()
        );
        let funds = ctx.fund_service.read_all_funds().await.unwrap();
        assert!(
            funds.is_empty(),
            "attempt {attempt} created {} fund(s)",
            funds.len()
        );
    }

    // The path without corrections is guarded the same way.
    let err = create_fund_payment_from_candidates_fn(
        CreateFundPaymentFromCandidatesRequest {
            candidates: vec![
                candidate("CPAM n° 941", 38_400),
                candidate("CPAM n° 951", 0),
            ],
        },
        ctx.orchestrator.clone(),
    )
    .await
    .expect_err("a group with a zero total cannot be created");
    assert_eq!(
        serde_json::to_value(&err).unwrap(),
        serde_json::json!({ "code": "TotalAmountNotPositive" }),
    );
    assert!(ctx.fund_service.read_all_funds().await.unwrap().is_empty());
}
