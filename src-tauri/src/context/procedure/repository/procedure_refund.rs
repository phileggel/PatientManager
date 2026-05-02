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
        let status_str = procedure_status_to_str(refund.previous_payment_status);

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

        Ok(row.map(|r| {
            let date =
                NaiveDate::parse_from_str(&r.refund_date, "%Y-%m-%d").unwrap_or(NaiveDate::MIN);
            let status = parse_procedure_status(&r.previous_payment_status);

            ProcedureRefund::restore(
                r.id,
                r.source_procedure_id,
                r.refund_procedure_id,
                r.refund_fund_payment_group_id,
                r.refund_bank_transfer_id,
                date,
                r.reason,
                status,
            )
        }))
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

        Ok(row.map(|r| {
            let date =
                NaiveDate::parse_from_str(&r.refund_date, "%Y-%m-%d").unwrap_or(NaiveDate::MIN);
            let status = parse_procedure_status(&r.previous_payment_status);

            ProcedureRefund::restore(
                r.id,
                r.source_procedure_id,
                r.refund_procedure_id,
                r.refund_fund_payment_group_id,
                r.refund_bank_transfer_id,
                date,
                r.reason,
                status,
            )
        }))
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

fn procedure_status_to_str(status: ProcedureStatus) -> &'static str {
    match status {
        ProcedureStatus::None => "NONE",
        ProcedureStatus::Created => "CREATED",
        ProcedureStatus::Reconciled => "RECONCILIATED",
        ProcedureStatus::PartiallyReconciled => "PARTIALLY_RECONCILED",
        ProcedureStatus::DirectlyPaid => "DIRECTLY_PAYED",
        ProcedureStatus::FundPaid => "FUND_PAYED",
        ProcedureStatus::PartiallyFundPaid => "PARTIALLY_FUND_PAYED",
        ProcedureStatus::ImportDirectlyPaid => "IMPORT_DIRECTLY_PAYED",
        ProcedureStatus::ImportFundPaid => "IMPORT_FUND_PAYED",
        ProcedureStatus::Overpaid => "OVERPAID",
        ProcedureStatus::OverpaymentRefund => "OVERPAYMENT_REFUND",
    }
}

fn parse_procedure_status(s: &str) -> ProcedureStatus {
    match s {
        "CREATED" => ProcedureStatus::Created,
        "RECONCILIATED" => ProcedureStatus::Reconciled,
        "PARTIALLY_RECONCILED" => ProcedureStatus::PartiallyReconciled,
        "DIRECTLY_PAYED" => ProcedureStatus::DirectlyPaid,
        "FUND_PAYED" => ProcedureStatus::FundPaid,
        "PARTIALLY_FUND_PAYED" => ProcedureStatus::PartiallyFundPaid,
        "IMPORT_DIRECTLY_PAYED" => ProcedureStatus::ImportDirectlyPaid,
        "IMPORT_FUND_PAYED" => ProcedureStatus::ImportFundPaid,
        "OVERPAID" => ProcedureStatus::Overpaid,
        "OVERPAYMENT_REFUND" => ProcedureStatus::OverpaymentRefund,
        _ => ProcedureStatus::None,
    }
}
