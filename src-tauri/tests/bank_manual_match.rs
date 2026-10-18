//! Integration tests for the direct-transfer commands of manual bank matching,
//! against an in-memory SQLite database (#391): a refund's transfer (REF-110)
//! is removed only by the refund's cancellation (REF-210).

use std::sync::Arc;

use patient_manager_app::{
    context::{
        bank::{
            BankEntryService, SqliteBankAccountRepository, SqliteBankEntryLinkRepository,
            SqliteBankEntryRepository,
        },
        fund::{FundPaymentService, SqliteFundPaymentRepository},
        procedure::{ProcedureService, SqliteProcedureRepository},
    },
    shared::{event_bus::EventBus, uow::SqlxTransactionManager},
    use_cases::bank_manual_match::{
        BankManualMatchError, BankManualMatchOrchestrator, BankManualMatchTask,
    },
};
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

async fn setup() -> (BankManualMatchOrchestrator, SqlitePool) {
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
    let orchestrator = BankManualMatchOrchestrator::new(
        Arc::new(BankEntryService::new(
            Arc::new(SqliteBankEntryRepository::new(pool.clone())),
            Arc::new(SqliteBankAccountRepository::new(pool.clone())),
            bus.clone(),
        )),
        Arc::new(SqliteBankEntryLinkRepository::new(pool.clone())),
        Arc::new(FundPaymentService::new(
            Arc::new(SqliteFundPaymentRepository::new(pool.clone())),
            bus.clone(),
        )),
        Arc::new(ProcedureService::new(
            Arc::new(SqliteProcedureRepository::new(pool.clone())),
            bus,
        )),
        Arc::new(SqlxTransactionManager::new(pool.clone())),
    );
    (orchestrator, pool)
}

/// A refund's transfer as the refund cascade stores it (REF-110), of the
/// given type, linked to its refund group (REF-120).
async fn seed_refund_transfer(pool: &SqlitePool, transfer_type: &str) -> String {
    for statement in [
        "INSERT INTO fund (id, fund_identifier, name) VALUES ('fund-1', '93', 'CPAM n° 93')",
        "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status, origin)
         VALUES ('refund-group', 'fund-1', '2026-03-10', -150000, 'BANK_PAYED', 'REFUND')",
    ] {
        sqlx::query(statement)
            .execute(pool)
            .await
            .expect("seed the refund group");
    }
    sqlx::query(
        "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
         VALUES ('refund-transfer', '2026-03-10', -150000, ?, 'cash-account-default')",
    )
    .bind(transfer_type)
    .execute(pool)
    .await
    .expect("seed the refund transfer");
    sqlx::query(
        "INSERT INTO bank_transfer_fund_group_link (id, bank_transfer_id, fund_payment_group_id)
         VALUES ('refund-link', 'refund-transfer', 'refund-group')",
    )
    .execute(pool)
    .await
    .expect("seed the refund link");
    "refund-transfer".to_string()
}

async fn transfer_count(pool: &SqlitePool, id: &str) -> i64 {
    sqlx::query_scalar("SELECT COUNT(*) FROM bank_transfer WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .expect("count transfers")
}

/// REF-210 (#391): whatever the type the user paid the refund with (REF-060),
/// neither direct-transfer command takes the refund's transfer; it stays.
#[tokio::test]
async fn ref_210_direct_transfer_commands_refuse_a_refund_transfer() {
    for stored_type in ["OUTGOING_WIRE", "CHECK", "CREDIT_CARD"] {
        let (orchestrator, pool) = setup().await;
        let transfer_id = seed_refund_transfer(&pool, stored_type).await;

        let update = orchestrator
            .update_direct_transfer(transfer_id.clone(), "2026-03-11".to_string(), vec![])
            .await
            .expect_err("a refund's transfer is not a direct payment");
        let delete = orchestrator
            .delete_direct_transfer(transfer_id.clone())
            .await
            .expect_err("a refund's transfer is not a direct payment");

        for err in [update, delete] {
            assert!(
                matches!(
                    err,
                    BankManualMatchError::Task(BankManualMatchTask::WrongTransferType)
                ),
                "{stored_type}: {err:?}"
            );
        }
        assert_eq!(
            transfer_count(&pool, &transfer_id).await,
            1,
            "{stored_type}"
        );
    }
}
