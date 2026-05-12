//! Integration tests for the fund-payment manual-match flows.
//!
//! Covers the FPM-* rules wired through `FundPaymentReconciliationOrchestrator`:
//!
//! - FPM-200 (R3) — Required fields (fund + valid date)
//! - FPM-310 (R7) — Removing a procedure resets it to Created
//! - FPM-320 (R8) — Adding a Created procedure flips it to Reconciled
//! - FPM-330 (R9) — Update/delete rejected when a procedure is bank-reconciled
//! - FPM-400 (R11) — Deleting an unlocked group resets every associated procedure
//! - FPM-100/110 (R1/R2) — Picker shows current + available procedures filtered by fund
//!
//! Tests use the public service/orchestrator API end-to-end against an
//! in-memory SQLite. Only the bank-reconciliation transition (FUND_PAYED)
//! is applied via raw SQL since no public path exposes it — the bank-match
//! feature would be the natural driver but is out of scope here.
use std::sync::Arc;

use chrono::NaiveDate;
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
    use_cases::fund_payment_reconciliation::FundPaymentReconciliationOrchestrator,
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

struct Ctx {
    orchestrator: Arc<FundPaymentReconciliationOrchestrator>,
    procedure_service: Arc<ProcedureService>,
    fund_payment_service: Arc<FundPaymentService>,
    patient_id: String,
    fund_id: String,
    proc_type_id: String,
    pool: SqlitePool,
}

async fn build_ctx() -> Ctx {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(":memory:")
        .await
        .expect("in-memory SQLite pool");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrations");

    let bus = Arc::new(EventBus::new());

    let fund_repo = Arc::new(SqliteFundRepository::new(pool.clone()));
    let fund_service = Arc::new(FundService::new(fund_repo, bus.clone()));

    let fp_repo = Arc::new(SqliteFundPaymentRepository::new(pool.clone()));
    let fund_payment_service = Arc::new(FundPaymentService::new(fp_repo, bus.clone()));

    let proc_repo = Arc::new(SqliteProcedureRepository::new(pool.clone()));
    let procedure_service = Arc::new(ProcedureService::new(proc_repo, bus.clone()));

    let patient_repo = Arc::new(SqlitePatientRepository::new(pool.clone()));
    let patient_service = Arc::new(PatientService::new(patient_repo, bus.clone()));

    let pt_repo = Arc::new(SqliteProcedureTypeRepository::new(pool.clone()));
    let procedure_type_service = Arc::new(ProcedureTypeService::new(pt_repo, bus.clone()));

    let orchestrator = Arc::new(FundPaymentReconciliationOrchestrator::new(
        fund_service.clone(),
        procedure_service.clone(),
        fund_payment_service.clone(),
        bus,
    ));

    let patient = patient_service
        .create_patient(
            Some("Alice DUPONT".to_string()),
            Some("1234567890123".to_string()),
        )
        .await
        .expect("seed patient");
    let fund = fund_service
        .create_fund("93".to_string(), "CPAM n° 93".to_string())
        .await
        .expect("seed fund");
    let pt = procedure_type_service
        .add_procedure_type("Consultation".to_string(), 100_000, None)
        .await
        .expect("seed procedure type");

    Ctx {
        orchestrator,
        procedure_service,
        fund_payment_service,
        patient_id: patient.id,
        fund_id: fund.id,
        proc_type_id: pt.id,
        pool,
    }
}

async fn create_procedure(ctx: &Ctx, amount: i64, status: ProcedureStatus) -> String {
    ctx.procedure_service
        .create_procedure(
            ctx.patient_id.clone(),
            Some(ctx.fund_id.clone()),
            ctx.proc_type_id.clone(),
            "2026-01-15".to_string(),
            Some(amount),
            PaymentMethod::None,
            None,
            None,
            status,
        )
        .await
        .expect("seed procedure")
        .id
}

/// Promotes a procedure to `FUND_PAYED` to simulate the bank-statement-match
/// transition (FPM-010 Stage 2). No public service exposes this write — the
/// production driver is the bank-match feature, which is out of scope for
/// these tests.
async fn mark_procedure_fund_payed(pool: &SqlitePool, proc_id: &str) {
    sqlx::query(r#"UPDATE "procedure" SET payment_status = 'FUND_PAYED' WHERE id = ?"#)
        .bind(proc_id)
        .execute(pool)
        .await
        .expect("mark FUND_PAYED");
}

// ---------------------------------------------------------------------------
// FPM-200 (R3) — Required fields
// ---------------------------------------------------------------------------

/// FPM-200 — Creation succeeds with a fund, a valid date, and at least one
/// procedure; both procedures move to `Reconciled` and the group total
/// equals Σ procedure_amount (FPM-210/R4).
#[tokio::test]
async fn manual_create_with_valid_inputs_creates_group_and_reconciles() -> anyhow::Result<()> {
    let ctx = build_ctx().await;
    let proc_a = create_procedure(&ctx, 60_000, ProcedureStatus::Created).await;
    let proc_b = create_procedure(&ctx, 40_000, ProcedureStatus::Created).await;

    let group = ctx
        .orchestrator
        .create_manual_fund_payment_group(
            ctx.fund_id.clone(),
            "2026-01-20".to_string(),
            vec![proc_a.clone(), proc_b.clone()],
        )
        .await?;

    assert_eq!(group.total_amount, 100_000);
    assert_eq!(group.lines.len(), 2);

    let procs = ctx
        .procedure_service
        .read_procedures_by_ids(vec![proc_a, proc_b])
        .await?;
    for p in &procs {
        assert!(matches!(p.payment_status, ProcedureStatus::Reconciled));
        assert_eq!(
            p.confirmed_payment_date,
            Some(NaiveDate::from_ymd_opt(2026, 1, 20).unwrap())
        );
    }
    Ok(())
}

/// FPM-200 — An unparseable payment date is rejected.
#[tokio::test]
async fn manual_create_with_invalid_date_returns_error() -> anyhow::Result<()> {
    let ctx = build_ctx().await;

    let result = ctx
        .orchestrator
        .create_manual_fund_payment_group(ctx.fund_id.clone(), "not-a-date".to_string(), vec![])
        .await;

    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("Invalid payment date"));
    Ok(())
}

// ---------------------------------------------------------------------------
// FPM-310 (R7) / FPM-320 (R8) — Membership transitions
// ---------------------------------------------------------------------------

/// FPM-310 — Removing a procedure reverts it to `Created`, clears
/// `confirmed_payment_date` + `actual_payment_amount`, and recomputes the
/// group total. The retained procedure keeps its `Reconciled` state.
#[tokio::test]
async fn manual_update_remove_reverts_procedure_to_created() -> anyhow::Result<()> {
    let ctx = build_ctx().await;
    let proc_a = create_procedure(&ctx, 70_000, ProcedureStatus::Created).await;
    let proc_b = create_procedure(&ctx, 30_000, ProcedureStatus::Created).await;

    let group = ctx
        .orchestrator
        .create_manual_fund_payment_group(
            ctx.fund_id.clone(),
            "2026-01-15".to_string(),
            vec![proc_a.clone(), proc_b.clone()],
        )
        .await?;

    let updated = ctx
        .orchestrator
        .update_manual_fund_payment_group(
            group.id.clone(),
            "2026-01-15".to_string(),
            vec![proc_a.clone()],
        )
        .await?;

    assert_eq!(updated.total_amount, 70_000, "group total recomputed (R4)");

    let reloaded = ctx
        .fund_payment_service
        .read_group(&group.id)
        .await?
        .expect("group still present");
    assert_eq!(reloaded.lines.len(), 1);
    assert_eq!(reloaded.lines[0].procedure_id, proc_a);

    let removed = ctx
        .procedure_service
        .read_procedures_by_ids(vec![proc_b])
        .await?;
    assert!(matches!(
        removed[0].payment_status,
        ProcedureStatus::Created
    ));
    assert_eq!(removed[0].confirmed_payment_date, None);
    assert_eq!(removed[0].paid_amount, None);

    let kept = ctx
        .procedure_service
        .read_procedures_by_ids(vec![proc_a])
        .await?;
    assert!(matches!(
        kept[0].payment_status,
        ProcedureStatus::Reconciled
    ));
    assert!(kept[0].confirmed_payment_date.is_some());
    assert!(kept[0].paid_amount.is_some());
    Ok(())
}

/// FPM-320 — Adding a `Created` procedure flips it to `Reconciled`, sets
/// `confirmed_payment_date` to the group's payment date, and sets
/// `actual_payment_amount` to its `procedure_amount`.
#[tokio::test]
async fn manual_update_add_flips_procedure_to_reconciled() -> anyhow::Result<()> {
    let ctx = build_ctx().await;
    let proc_existing = create_procedure(&ctx, 50_000, ProcedureStatus::Created).await;
    let proc_new = create_procedure(&ctx, 25_000, ProcedureStatus::Created).await;

    let group = ctx
        .orchestrator
        .create_manual_fund_payment_group(
            ctx.fund_id.clone(),
            "2026-01-15".to_string(),
            vec![proc_existing.clone()],
        )
        .await?;

    let updated = ctx
        .orchestrator
        .update_manual_fund_payment_group(
            group.id.clone(),
            "2026-01-20".to_string(),
            vec![proc_existing, proc_new.clone()],
        )
        .await?;

    assert_eq!(updated.total_amount, 75_000, "group total recomputed (R4)");

    let reloaded = ctx
        .fund_payment_service
        .read_group(&group.id)
        .await?
        .expect("group still present");
    assert_eq!(reloaded.lines.len(), 2);

    let added = ctx
        .procedure_service
        .read_procedures_by_ids(vec![proc_new])
        .await?;
    assert!(matches!(
        added[0].payment_status,
        ProcedureStatus::Reconciled
    ));
    assert_eq!(
        added[0].confirmed_payment_date,
        Some(NaiveDate::from_ymd_opt(2026, 1, 20).unwrap())
    );
    assert_eq!(added[0].paid_amount, Some(25_000));
    Ok(())
}

// ---------------------------------------------------------------------------
// FPM-330 (R9) — Lock after bank reconciliation
// ---------------------------------------------------------------------------

/// FPM-330 — Update is rejected when any procedure in the group has been
/// reconciled at the bank level (`FundPaid`).
#[tokio::test]
async fn manual_update_locked_group_is_rejected() -> anyhow::Result<()> {
    let ctx = build_ctx().await;
    let proc_id = create_procedure(&ctx, 100_000, ProcedureStatus::Created).await;
    let group = ctx
        .orchestrator
        .create_manual_fund_payment_group(
            ctx.fund_id.clone(),
            "2026-01-15".to_string(),
            vec![proc_id.clone()],
        )
        .await?;

    mark_procedure_fund_payed(&ctx.pool, &proc_id).await;

    let result = ctx
        .orchestrator
        .update_manual_fund_payment_group(group.id, "2026-01-15".to_string(), vec![proc_id.clone()])
        .await;

    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("bank-reconciled"));
    Ok(())
}

/// FPM-330 — Delete is rejected when any procedure in the group has been
/// reconciled at the bank level (`FundPaid`).
#[tokio::test]
async fn manual_delete_locked_group_is_rejected() -> anyhow::Result<()> {
    let ctx = build_ctx().await;
    let proc_id = create_procedure(&ctx, 100_000, ProcedureStatus::Created).await;
    let group = ctx
        .orchestrator
        .create_manual_fund_payment_group(
            ctx.fund_id.clone(),
            "2026-01-15".to_string(),
            vec![proc_id.clone()],
        )
        .await?;

    mark_procedure_fund_payed(&ctx.pool, &proc_id).await;

    let result = ctx
        .orchestrator
        .delete_fund_payment_group_with_cleanup(&group.id)
        .await;

    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("bank-reconciled"));
    Ok(())
}

// ---------------------------------------------------------------------------
// FPM-400 (R11) — Delete resets procedures
// ---------------------------------------------------------------------------

/// FPM-400 — Deleting an unlocked group resets every associated procedure
/// to `Created` and clears `confirmed_payment_date` + `actual_payment_amount`.
/// The group itself is soft-deleted (no longer readable).
#[tokio::test]
async fn manual_delete_unlocked_group_resets_all_procedures() -> anyhow::Result<()> {
    let ctx = build_ctx().await;
    let proc_a = create_procedure(&ctx, 40_000, ProcedureStatus::Created).await;
    let proc_b = create_procedure(&ctx, 60_000, ProcedureStatus::Created).await;

    let group = ctx
        .orchestrator
        .create_manual_fund_payment_group(
            ctx.fund_id.clone(),
            "2026-01-15".to_string(),
            vec![proc_a.clone(), proc_b.clone()],
        )
        .await?;

    ctx.orchestrator
        .delete_fund_payment_group_with_cleanup(&group.id)
        .await?;

    let procedures = ctx
        .procedure_service
        .read_procedures_by_ids(vec![proc_a, proc_b])
        .await?;
    assert_eq!(procedures.len(), 2);
    for p in &procedures {
        assert!(matches!(p.payment_status, ProcedureStatus::Created));
        assert_eq!(p.confirmed_payment_date, None);
        assert_eq!(p.paid_amount, None);
    }

    let group_after = ctx.fund_payment_service.read_group(&group.id).await?;
    assert!(
        group_after.is_none(),
        "group should be soft-deleted after cleanup"
    );
    Ok(())
}

// ---------------------------------------------------------------------------
// FPM-100 / FPM-110 (R1/R2) — Picker shows current + available
// ---------------------------------------------------------------------------

/// FPM-100 + FPM-110 — `get_group_edit_data` returns (current, available):
/// current is the procedures already in the group; available is the
/// `Created` procedures for the same fund whose date ≤ group payment_date,
/// minus those already in the group.
#[tokio::test]
async fn manual_edit_data_returns_current_and_available_for_fund() -> anyhow::Result<()> {
    let ctx = build_ctx().await;

    let proc_in_group = create_procedure(&ctx, 50_000, ProcedureStatus::Created).await;
    let proc_available = create_procedure(&ctx, 30_000, ProcedureStatus::Created).await;
    let group = ctx
        .orchestrator
        .create_manual_fund_payment_group(
            ctx.fund_id.clone(),
            "2026-01-15".to_string(),
            vec![proc_in_group.clone()],
        )
        .await?;

    let (current, available) = ctx
        .orchestrator
        .get_group_edit_data(&group.id, &ctx.fund_id)
        .await?;

    assert_eq!(current.len(), 1);
    assert_eq!(current[0].id, proc_in_group);
    assert!(
        available.iter().any(|p| p.id == proc_available),
        "Created procedure for this fund must appear as available"
    );
    assert!(
        !available.iter().any(|p| p.id == proc_in_group),
        "current procedure must not appear in available"
    );
    Ok(())
}
