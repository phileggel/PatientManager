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
///    candidates + AmountMismatch → 2 groups created, 5 procedures Reconciliated.
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
    core::event_bus::EventBus,
    use_cases::fund_payment_reconciliation::{
        api::{
            create_fund_payment_with_auto_corrections_fn, reconcile_and_create_candidates_fn,
            AutoCorrection, CreateFundPaymentWithAutoCorrectionsRequest, NormalizedPdfLine,
            PdfParseResult, PdfProcedureGroup,
        },
        FundPaymentReconciliationOrchestrator, ReconciliationService,
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
        let date = date.to_string();
        async move {
            svc.create_procedure(
                patient_id,
                Some(fund_id),
                pt_id,
                date,
                Some(amount),
                PaymentMethod::None,
                None,
                None,
                ProcedureStatus::None,
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

    // ---- Assert: all procedures Reconciliated -------------------------
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
        assert_eq!(proc.payment_status, ProcedureStatus::Reconciliated);
    }

    // ---- Assert: p5 amount corrected in DB ---------------------------
    let p5_db = procedures.iter().find(|p| p.id == p5.id).unwrap();
    assert_eq!(p5_db.procedure_amount, Some(28_500));

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
            "2025-04-01".to_string(),
            Some(38_400),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::None,
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
            "2025-04-15".to_string(),
            Some(52_000),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::None,
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
            "2025-04-10".to_string(),
            Some(25_000),
            PaymentMethod::None,
            None,
            None,
            ProcedureStatus::None,
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
    let reconcile_response =
        reconcile_and_create_candidates_fn(parse_result, ctx.reconciliation_service.clone())
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
                patient_manager_app::use_cases::fund_payment_reconciliation::api::ReconciliationMatch::PerfectSingleMatch { .. }
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

    // ---- Assert: all 3 procedures Reconciliated ----------------------
    let procedures = ctx
        .procedure_service
        .read_procedures_by_ids(vec![p1.id.clone(), p2.id.clone(), p3.id.clone()])
        .await
        .unwrap();

    assert_eq!(procedures.len(), 3);
    for proc in &procedures {
        assert_eq!(
            proc.payment_status,
            ProcedureStatus::Reconciliated,
            "Procedure {} should be Reconciliated",
            proc.id
        );
    }

    // ---- Assert: p3 amount corrected in DB ---------------------------
    let p3_db = procedures.iter().find(|p| p.id == p3.id).unwrap();
    assert_eq!(
        p3_db.procedure_amount,
        Some(28_500),
        "p3 amount should be corrected from 25 000 to 28 500"
    );
}
