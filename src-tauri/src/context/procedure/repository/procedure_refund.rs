use anyhow::Context;
use chrono::NaiveDate;
use sqlx::SqlitePool;

use crate::context::procedure::domain::{
    ProcedureRefund, ProcedureRefundRepository, ProcedureStatus,
};

pub struct SqliteProcedureRefundRepository {
    pool: SqlitePool,
}

impl SqliteProcedureRefundRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl ProcedureRefundRepository for SqliteProcedureRefundRepository {
    async fn create_procedure_refund(&self, refund: &ProcedureRefund) -> anyhow::Result<()> {
        let refund_date_str = refund.refund_date.format("%Y-%m-%d").to_string();
        let status_str = refund.previous_payment_status.as_db_str();

        sqlx::query!(
            r#"
            INSERT INTO procedure_refund (
                id,
                source_procedure_id,
                refund_procedure_id,
                refund_fund_payment_group_id,
                refund_bank_transfer_id,
                refund_date,
                reason,
                previous_payment_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#,
            refund.id,
            refund.source_procedure_id,
            refund.refund_procedure_id,
            refund.refund_fund_payment_group_id,
            refund.refund_bank_transfer_id,
            refund_date_str,
            refund.reason,
            status_str,
        )
        .execute(&self.pool)
        .await
        .context("Failed to insert procedure_refund")?;

        Ok(())
    }

    async fn find_by_source_procedure_id(
        &self,
        source_id: &str,
    ) -> anyhow::Result<Option<ProcedureRefund>> {
        let row = sqlx::query!(
            r#"
            SELECT
                id,
                source_procedure_id,
                refund_procedure_id,
                refund_fund_payment_group_id,
                refund_bank_transfer_id,
                refund_date,
                reason,
                previous_payment_status
            FROM procedure_refund
            WHERE source_procedure_id = $1
            LIMIT 1
            "#,
            source_id,
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to find procedure_refund by source_procedure_id")?;

        row.map(|r| -> anyhow::Result<ProcedureRefund> {
            let date = NaiveDate::parse_from_str(&r.refund_date, "%Y-%m-%d")
                .with_context(|| format!("Invalid refund_date in DB: {}", r.refund_date))?;
            let status = r
                .previous_payment_status
                .parse::<ProcedureStatus>()
                .unwrap_or_default();
            Ok(ProcedureRefund::restore(
                r.id,
                r.source_procedure_id,
                r.refund_procedure_id,
                r.refund_fund_payment_group_id,
                r.refund_bank_transfer_id,
                date,
                r.reason,
                status,
            ))
        })
        .transpose()
    }

    async fn find_by_refund_procedure_id(
        &self,
        refund_procedure_id: &str,
    ) -> anyhow::Result<Option<ProcedureRefund>> {
        let row = sqlx::query!(
            r#"
            SELECT
                id,
                source_procedure_id,
                refund_procedure_id,
                refund_fund_payment_group_id,
                refund_bank_transfer_id,
                refund_date,
                reason,
                previous_payment_status
            FROM procedure_refund
            WHERE refund_procedure_id = $1
            LIMIT 1
            "#,
            refund_procedure_id,
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to find procedure_refund by refund_procedure_id")?;

        row.map(|r| -> anyhow::Result<ProcedureRefund> {
            let date = NaiveDate::parse_from_str(&r.refund_date, "%Y-%m-%d")
                .with_context(|| format!("Invalid refund_date in DB: {}", r.refund_date))?;
            let status = r
                .previous_payment_status
                .parse::<ProcedureStatus>()
                .unwrap_or_default();
            Ok(ProcedureRefund::restore(
                r.id,
                r.source_procedure_id,
                r.refund_procedure_id,
                r.refund_fund_payment_group_id,
                r.refund_bank_transfer_id,
                date,
                r.reason,
                status,
            ))
        })
        .transpose()
    }

    async fn delete_procedure_refund(&self, id: &str) -> anyhow::Result<()> {
        sqlx::query!(r#"DELETE FROM procedure_refund WHERE id = ?"#, id,)
            .execute(&self.pool)
            .await
            .context("Failed to delete procedure_refund")?;

        Ok(())
    }

    async fn is_refund_fund_payment_group(&self, group_id: &str) -> anyhow::Result<bool> {
        let row = sqlx::query!(
            r#"
            SELECT id FROM procedure_refund
            WHERE refund_fund_payment_group_id = $1
            LIMIT 1
            "#,
            group_id,
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to check refund fund payment group")?;

        Ok(row.is_some())
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    use super::*;
    use crate::context::procedure::domain::ProcedureRefund;

    async fn setup() -> SqliteProcedureRefundRepository {
        let opts = SqliteConnectOptions::new()
            .in_memory(true)
            .foreign_keys(false);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        SqliteProcedureRefundRepository { pool }
    }

    fn make_refund(source_id: &str, refund_id: &str) -> ProcedureRefund {
        ProcedureRefund::new(
            source_id.to_string(),
            refund_id.to_string(),
            "group-1".to_string(),
            "transfer-1".to_string(),
            "2026-01-15".to_string(),
            None,
            ProcedureStatus::FundPaid,
        )
        .unwrap()
    }

    #[tokio::test]
    async fn create_and_find_by_source_procedure_id() {
        let repo = setup().await;
        let refund = make_refund("src-1", "ref-1");
        repo.create_procedure_refund(&refund).await.unwrap();

        let found = repo.find_by_source_procedure_id("src-1").await.unwrap();
        assert!(found.is_some());
        let found = found.unwrap();
        assert_eq!(found.source_procedure_id, "src-1");
        assert_eq!(found.refund_procedure_id, "ref-1");
        assert_eq!(found.previous_payment_status, ProcedureStatus::FundPaid);
    }

    #[tokio::test]
    async fn find_by_source_procedure_id_returns_none_when_absent() {
        let repo = setup().await;
        let found = repo
            .find_by_source_procedure_id("no-such-id")
            .await
            .unwrap();
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn create_and_find_by_refund_procedure_id() {
        let repo = setup().await;
        let refund = make_refund("src-2", "ref-2");
        repo.create_procedure_refund(&refund).await.unwrap();

        let found = repo.find_by_refund_procedure_id("ref-2").await.unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().source_procedure_id, "src-2");
    }

    #[tokio::test]
    async fn delete_procedure_refund_removes_record() {
        let repo = setup().await;
        let refund = make_refund("src-3", "ref-3");
        repo.create_procedure_refund(&refund).await.unwrap();
        repo.delete_procedure_refund(&refund.id).await.unwrap();

        let found = repo.find_by_source_procedure_id("src-3").await.unwrap();
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn is_refund_fund_payment_group_returns_true_when_exists() {
        let repo = setup().await;
        let refund = make_refund("src-4", "ref-4");
        repo.create_procedure_refund(&refund).await.unwrap();

        let result = repo.is_refund_fund_payment_group("group-1").await.unwrap();
        assert!(result);
    }

    #[tokio::test]
    async fn is_refund_fund_payment_group_returns_false_when_absent() {
        let repo = setup().await;
        let result = repo.is_refund_fund_payment_group("no-group").await.unwrap();
        assert!(!result);
    }

    #[tokio::test]
    async fn create_stores_reason_when_provided() {
        let repo = setup().await;
        let refund = ProcedureRefund::new(
            "src-5".to_string(),
            "ref-5".to_string(),
            "group-5".to_string(),
            "transfer-5".to_string(),
            "2026-02-01".to_string(),
            Some("Overpayment correction".to_string()),
            ProcedureStatus::Overpaid,
        )
        .unwrap();
        repo.create_procedure_refund(&refund).await.unwrap();
        let found = repo
            .find_by_source_procedure_id("src-5")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(found.reason.as_deref(), Some("Overpayment correction"));
        assert_eq!(found.previous_payment_status, ProcedureStatus::Overpaid);
    }
}
