//! Integration tests for the overpayment cascade (`docs/spec/overpayment.md`),
//! against an in-memory SQLite database (#391): each step's writes are read
//! back, not only the command's `Ok`.

use std::sync::Arc;

use chrono::NaiveDate;
use patient_manager_app::{
    context::{
        bank::{
            BankAccountService, BankEntryLinkRepository, BankEntryService, BankEntryType,
            SqliteBankAccountRepository, SqliteBankEntryLinkRepository, SqliteBankEntryRepository,
        },
        fund::{
            FundPaymentGroupStatus, FundPaymentService, FundService, GroupOrigin,
            SqliteFundPaymentRepository, SqliteFundRepository,
        },
        patient::{PatientService, SqlitePatientRepository},
        procedure::{
            PaymentMethod, Procedure, ProcedureRefundRepository, ProcedureService, ProcedureStatus,
            ProcedureTypeService, SqliteProcedureRefundRepository, SqliteProcedureRepository,
            SqliteProcedureTypeRepository,
        },
    },
    shared::event_bus::EventBus,
    use_cases::overpayment::{CreateOverpaymentRequest, OverpaymentOrchestrator},
    use_cases::procedure_orchestration::ProcedureOrchestrationService,
};
use sqlx::sqlite::SqlitePoolOptions;

const BILLED: i64 = 56_000;

struct Ctx {
    orchestrator: OverpaymentOrchestrator,
    procedure_orchestration: ProcedureOrchestrationService,
    procedure_service: Arc<ProcedureService>,
    procedure_type_service: Arc<ProcedureTypeService>,
    fund_payment_service: Arc<FundPaymentService>,
    bank_entry_service: Arc<BankEntryService>,
    link_repo: Arc<SqliteBankEntryLinkRepository>,
    refund_repo: Arc<SqliteProcedureRefundRepository>,
    source_id: String,
    patient_id: String,
    fund_id: String,
    proc_type_id: String,
    account_id: String,
}

async fn build_ctx() -> Ctx {
    build_ctx_paid_as("FUND_PAYED").await
}

/// A context whose source procedure the fund paid, stored with `status`.
async fn build_ctx_paid_as(status: &str) -> Ctx {
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
    let fund_service = Arc::new(FundService::new(fund_repo.clone(), bus.clone()));
    let fund_payment_service = Arc::new(FundPaymentService::new(
        Arc::new(SqliteFundPaymentRepository::new(pool.clone())),
        bus.clone(),
    ));
    let procedure_service = Arc::new(ProcedureService::new(
        Arc::new(SqliteProcedureRepository::new(pool.clone())),
        bus.clone(),
    ));
    let patient_repo = Arc::new(SqlitePatientRepository::new(pool.clone()));
    let patient_service = Arc::new(PatientService::new(patient_repo.clone(), bus.clone()));
    let procedure_type_repo = Arc::new(SqliteProcedureTypeRepository::new(pool.clone()));
    let procedure_type_service = Arc::new(ProcedureTypeService::new(
        procedure_type_repo.clone(),
        bus.clone(),
    ));
    let account_repo = Arc::new(SqliteBankAccountRepository::new(pool.clone()));
    let bank_account_service = Arc::new(BankAccountService::new(account_repo.clone(), bus.clone()));
    let bank_entry_service = Arc::new(BankEntryService::new(
        Arc::new(SqliteBankEntryRepository::new(pool.clone())),
        account_repo,
        bus.clone(),
    ));
    let link_repo = Arc::new(SqliteBankEntryLinkRepository::new(pool.clone()));
    let refund_repo = Arc::new(SqliteProcedureRefundRepository::new(pool.clone()));

    let orchestrator = OverpaymentOrchestrator::new(
        procedure_service.clone(),
        fund_payment_service.clone(),
        bank_entry_service.clone(),
        bank_account_service.clone(),
        link_repo.clone(),
        refund_repo.clone(),
    );
    let procedure_orchestration = ProcedureOrchestrationService::new(
        procedure_service.clone(),
        patient_repo,
        procedure_type_repo,
        fund_repo,
        refund_repo.clone(),
    );

    let patient = patient_service
        .create_patient(Some("Jeanne EXEMPLE".to_string()), None)
        .await
        .expect("seed patient");
    let fund = fund_service
        .create_fund("93".to_string(), "CPAM n° 93".to_string())
        .await
        .expect("seed fund");
    let procedure_type = procedure_type_service
        .add_procedure_type("Consultation".to_string(), BILLED, None)
        .await
        .expect("seed procedure type");
    let account = bank_account_service
        .create_account("Compte courant".to_string(), None)
        .await
        .expect("seed bank account");
    let source = procedure_service
        .create_procedure(
            patient.id.clone(),
            Some(fund.id.clone()),
            procedure_type.id.clone(),
            NaiveDate::from_ymd_opt(2026, 1, 15).unwrap(),
            BILLED,
            PaymentMethod::None,
            None,
            None,
            None,
            ProcedureStatus::Created,
        )
        .await
        .expect("seed source procedure");
    // The fund paid it (FPM Stage 2): no public service writes this transition.
    sqlx::query(r#"UPDATE "procedure" SET payment_status = ? WHERE id = ?"#)
        .bind(status)
        .bind(&source.id)
        .execute(&pool)
        .await
        .expect("mark FUND_PAYED");

    Ctx {
        orchestrator,
        procedure_orchestration,
        procedure_service,
        procedure_type_service,
        fund_payment_service,
        bank_entry_service,
        link_repo,
        refund_repo,
        source_id: source.id,
        patient_id: patient.id,
        fund_id: fund.id,
        proc_type_id: procedure_type.id,
        account_id: account.id,
    }
}

fn refund_date() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 2, 1).unwrap()
}

async fn create(ctx: &Ctx) {
    create_paid_by(ctx, "OutgoingWire").await;
}

async fn create_paid_by(ctx: &Ctx, transfer_type: &str) {
    ctx.orchestrator
        .create_overpayment(CreateOverpaymentRequest {
            source_procedure_id: ctx.source_id.clone(),
            refund_date: "2026-02-01".to_string(),
            transfer_type: transfer_type.to_string(),
            bank_account_id: ctx.account_id.clone(),
            reason: Some("Indu".to_string()),
        })
        .await
        .expect("the overpayment is created");
}

/// REF-090 to REF-160: every record the creation cascade writes, read back.
#[tokio::test]
async fn ref_090_to_160_creation_writes_each_step() -> anyhow::Result<()> {
    let ctx = build_ctx().await;
    create(&ctx).await;

    // REF-130 — the refund record links everything.
    let record = ctx
        .refund_repo
        .find_by_source_procedure_id(&ctx.source_id)
        .await?
        .expect("REF-130: a refund record");
    assert_eq!(record.refund_date, refund_date());
    assert_eq!(record.reason.as_deref(), Some("Indu"));
    assert_eq!(record.previous_payment_status, ProcedureStatus::FundPaid);

    // REF-090 — the refund procedure mirrors the source, negative.
    let refund = ctx
        .procedure_service
        .read_procedure(&record.refund_procedure_id)
        .await?
        .expect("REF-090: the refund procedure");
    assert_eq!(refund.patient_id, ctx.patient_id);
    assert_eq!(refund.fund_id.as_deref(), Some(ctx.fund_id.as_str()));
    assert_eq!(refund.procedure_type_id, ctx.proc_type_id);
    assert_eq!(refund.billed_amount, -BILLED);
    assert_eq!(refund.payment_status, ProcedureStatus::OverpaymentRefund);
    assert_eq!(refund.procedure_date, refund_date());
    assert_eq!(refund.payment_method, PaymentMethod::BankTransfer);
    assert_eq!(refund.confirmed_payment_date, Some(refund_date()));
    assert_eq!(refund.paid_amount, Some(-BILLED));

    // REF-100 — the refund group, settled, holding the refund procedure only.
    let group = ctx
        .fund_payment_service
        .read_group(&record.refund_fund_payment_group_id)
        .await?
        .expect("REF-100: the refund group");
    assert_eq!(group.fund_id, ctx.fund_id);
    assert_eq!(group.total_amount, -BILLED);
    assert_eq!(group.payment_date, refund_date());
    assert_eq!(group.status, FundPaymentGroupStatus::BankPaid);
    assert!(group.is_locked);
    assert_eq!(group.origin, GroupOrigin::Refund);
    let lines: Vec<&str> = group
        .lines
        .iter()
        .map(|l| l.procedure_id.as_str())
        .collect();
    assert_eq!(lines, vec![record.refund_procedure_id.as_str()]);

    // REF-110 — the outgoing transfer.
    let transfer = ctx
        .bank_entry_service
        .read_transfer(&record.refund_bank_transfer_id)
        .await?
        .expect("REF-110: the refund transfer");
    assert_eq!(transfer.amount, -BILLED);
    assert_eq!(transfer.transfer_date, refund_date());
    assert_eq!(transfer.transfer_type, BankEntryType::FundOutgoingWire);
    assert_eq!(transfer.bank_account.id, ctx.account_id);

    // REF-120 — the transfer is linked to the group.
    let linked = ctx.link_repo.get_fund_group_ids(&transfer.id).await?;
    assert_eq!(linked, vec![group.id.clone()]);

    // REF-160 — the source is Overpaid.
    let source = ctx
        .procedure_service
        .read_procedure(&ctx.source_id)
        .await?
        .expect("the source procedure");
    assert_eq!(source.payment_status, ProcedureStatus::Overpaid);
    Ok(())
}

/// REF-210: the cancellation removes every record the creation wrote and
/// gives the source back its previous status.
#[tokio::test]
async fn ref_210_cancellation_removes_each_step() -> anyhow::Result<()> {
    let ctx = build_ctx().await;
    create(&ctx).await;
    let record = ctx
        .refund_repo
        .find_by_source_procedure_id(&ctx.source_id)
        .await?
        .expect("a refund record");

    ctx.orchestrator.cancel_overpayment(&ctx.source_id).await?;

    let source = ctx
        .procedure_service
        .read_procedure(&ctx.source_id)
        .await?
        .expect("the source procedure");
    assert_eq!(source.payment_status, ProcedureStatus::FundPaid);
    assert!(ctx
        .refund_repo
        .find_by_source_procedure_id(&ctx.source_id)
        .await?
        .is_none());
    assert!(ctx
        .link_repo
        .get_fund_group_ids(&record.refund_bank_transfer_id)
        .await?
        .is_empty());
    assert!(ctx
        .bank_entry_service
        .read_transfer(&record.refund_bank_transfer_id)
        .await?
        .is_none());
    assert!(ctx
        .fund_payment_service
        .read_group(&record.refund_fund_payment_group_id)
        .await?
        .is_none());
    assert!(ctx
        .procedure_service
        .read_procedure(&record.refund_procedure_id)
        .await?
        .is_none());
    Ok(())
}

/// REF-170: changing an Overpaid source's type changes its refund procedure's
/// type too.
#[tokio::test]
async fn ref_170_a_new_source_type_reaches_the_refund_procedure() -> anyhow::Result<()> {
    let ctx = build_ctx().await;
    create(&ctx).await;
    let record = ctx
        .refund_repo
        .find_by_source_procedure_id(&ctx.source_id)
        .await?
        .expect("a refund record");
    let new_type = ctx
        .procedure_type_service
        .add_procedure_type("Bilan".to_string(), BILLED, None)
        .await?;
    let source = ctx
        .procedure_service
        .read_procedure(&ctx.source_id)
        .await?
        .expect("the source procedure");
    let retyped = Procedure::restore(
        source.id,
        source.patient_id,
        source.fund_id,
        new_type.id.clone(),
        source.procedure_date,
        source.billed_amount,
        source.payment_method,
        source.fund_reconciliation_date,
        source.confirmed_payment_date,
        source.paid_amount,
        source.payment_status,
    );

    ctx.procedure_orchestration
        .update_procedure(retyped)
        .await?;

    let refund = ctx
        .procedure_service
        .read_procedure(&record.refund_procedure_id)
        .await?
        .expect("the refund procedure");
    assert_eq!(refund.procedure_type_id, new_type.id);
    Ok(())
}

/// REF-060, REF-090, REF-110: each transfer type the user picks sets the
/// refund procedure's payment method and the transfer's type.
#[tokio::test]
async fn ref_090_110_each_transfer_type_maps_to_its_method() -> anyhow::Result<()> {
    for (picked, method, transfer_type) in [
        (
            "CreditCard",
            PaymentMethod::BankCard,
            BankEntryType::PatientCreditCard,
        ),
        ("Check", PaymentMethod::Check, BankEntryType::PatientCheck),
        (
            "OutgoingWire",
            PaymentMethod::BankTransfer,
            BankEntryType::FundOutgoingWire,
        ),
    ] {
        let ctx = build_ctx().await;
        create_paid_by(&ctx, picked).await;
        let record = ctx
            .refund_repo
            .find_by_source_procedure_id(&ctx.source_id)
            .await?
            .expect("a refund record");

        let refund = ctx
            .procedure_service
            .read_procedure(&record.refund_procedure_id)
            .await?
            .expect("the refund procedure");
        assert_eq!(refund.payment_method, method, "{picked}");
        let transfer = ctx
            .bank_entry_service
            .read_transfer(&record.refund_bank_transfer_id)
            .await?
            .expect("the refund transfer");
        assert_eq!(transfer.transfer_type, transfer_type, "{picked}");
    }
    Ok(())
}

/// REF-130, REF-210: a partially paid source is stored as such and gets that
/// status back when the refund is cancelled.
#[tokio::test]
async fn ref_130_210_a_partially_paid_source_gets_its_status_back() -> anyhow::Result<()> {
    let ctx = build_ctx_paid_as("PARTIALLY_FUND_PAYED").await;
    create(&ctx).await;
    let record = ctx
        .refund_repo
        .find_by_source_procedure_id(&ctx.source_id)
        .await?
        .expect("a refund record");
    assert_eq!(
        record.previous_payment_status,
        ProcedureStatus::PartiallyFundPaid
    );

    ctx.orchestrator.cancel_overpayment(&ctx.source_id).await?;

    let source = ctx
        .procedure_service
        .read_procedure(&ctx.source_id)
        .await?
        .expect("the source procedure");
    assert_eq!(source.payment_status, ProcedureStatus::PartiallyFundPaid);
    Ok(())
}
