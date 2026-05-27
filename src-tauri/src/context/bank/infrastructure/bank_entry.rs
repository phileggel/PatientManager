use anyhow::Context;
use sqlx::SqlitePool;

use crate::context::bank::{
    domain::{BankAccount, BankEntry, BankEntryType},
    BankEntryRepository,
};

pub struct SqliteBankEntryRepository {
    pool: SqlitePool,
}

impl SqliteBankEntryRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl BankEntryRepository for SqliteBankEntryRepository {
    async fn create_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
        let type_str = transfer_type_to_str(transfer.transfer_type);

        tracing::info!(
            id = %transfer.id,
            transfer_date = %transfer.transfer_date,
            amount = transfer.amount,
            transfer_type = %type_str,
            account_id = %transfer.bank_account.id,
            "Creating bank transfer"
        );

        let transfer_date_str = transfer.transfer_date.format("%Y-%m-%d").to_string();

        sqlx::query!(
            r#"
            INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
            VALUES ($1, $2, $3, $4, $5)
            "#,
            transfer.id,
            transfer_date_str,
            transfer.amount,
            type_str,
            transfer.bank_account.id,
        )
        .execute(&self.pool)
        .await
        .context("Failed to insert bank transfer")?;

        Ok(transfer)
    }

    async fn read_transfer(&self, id: &str) -> anyhow::Result<Option<BankEntry>> {
        tracing::debug!(transfer_id = %id, "Reading bank transfer");

        let row = sqlx::query!(
            r#"
            SELECT
                bt.id,
                bt.transfer_date,
                bt.amount,
                bt.transfer_type,
                bt.bank_account_id,
                ba.id as account_id,
                ba.name as account_name,
                ba.iban as account_iban
            FROM bank_transfer bt
            JOIN bank_account ba ON bt.bank_account_id = ba.id
            WHERE bt.id = $1 AND ba.is_deleted = 0
            "#,
            id,
        )
        .fetch_optional(&self.pool)
        .await
        .context("Failed to read bank transfer")?;

        Ok(row.map(|r| {
            let account = BankAccount::restore(r.account_id, r.account_name, r.account_iban);
            BankEntry::restore(
                r.id,
                r.transfer_date,
                r.amount,
                parse_transfer_type(&r.transfer_type),
                account,
            )
        }))
    }

    async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankEntry>> {
        tracing::debug!("Reading all bank transfers");

        let rows = sqlx::query!(
            r#"
            SELECT
                bt.id,
                bt.transfer_date,
                bt.amount,
                bt.transfer_type,
                bt.bank_account_id,
                ba.id as account_id,
                ba.name as account_name,
                ba.iban as account_iban
            FROM bank_transfer bt
            JOIN bank_account ba ON bt.bank_account_id = ba.id
            WHERE ba.is_deleted = 0
            ORDER BY bt.transfer_date DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .context("Failed to read all bank transfers")?;

        Ok(rows
            .into_iter()
            .map(|r| {
                let account = BankAccount::restore(r.account_id, r.account_name, r.account_iban);
                BankEntry::restore(
                    r.id,
                    r.transfer_date,
                    r.amount,
                    parse_transfer_type(&r.transfer_type),
                    account,
                )
            })
            .collect())
    }

    async fn update_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
        let type_str = transfer_type_to_str(transfer.transfer_type);

        tracing::info!(
            transfer_id = %transfer.id,
            transfer_date = %transfer.transfer_date,
            amount = transfer.amount,
            account_id = %transfer.bank_account.id,
            "Updating bank transfer"
        );

        let transfer_date_str = transfer.transfer_date.format("%Y-%m-%d").to_string();

        sqlx::query!(
            r#"
            UPDATE bank_transfer
            SET transfer_date = ?, amount = ?, transfer_type = ?, bank_account_id = ?
            WHERE id = ?
            "#,
            transfer_date_str,
            transfer.amount,
            type_str,
            transfer.bank_account.id,
            transfer.id,
        )
        .execute(&self.pool)
        .await
        .context("Failed to update bank transfer")?;

        Ok(transfer)
    }

    async fn delete_transfer(&self, id: &str) -> anyhow::Result<()> {
        tracing::info!(transfer_id = %id, "Hard-deleting bank transfer");

        sqlx::query!(r#"DELETE FROM bank_transfer WHERE id = ?"#, id,)
            .execute(&self.pool)
            .await
            .context("Failed to delete bank transfer")?;

        Ok(())
    }

    /// Persist a fully-constructed BankEntry (no factory validation).
    /// Used for overpayment refund transfers which carry a negative amount (REF-110).
    async fn persist_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
        let type_str = transfer_type_to_str(transfer.transfer_type);
        let transfer_date_str = transfer.transfer_date.format("%Y-%m-%d").to_string();

        tracing::info!(
            id = %transfer.id,
            transfer_date = %transfer_date_str,
            amount = transfer.amount,
            transfer_type = %type_str,
            account_id = %transfer.bank_account.id,
            "Persisting bank transfer (bypass validation)"
        );

        sqlx::query!(
            r#"
            INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
            VALUES ($1, $2, $3, $4, $5)
            "#,
            transfer.id,
            transfer_date_str,
            transfer.amount,
            type_str,
            transfer.bank_account.id,
        )
        .execute(&self.pool)
        .await
        .context("Failed to persist bank transfer")?;

        Ok(transfer)
    }
}

fn transfer_type_to_str(t: BankEntryType) -> &'static str {
    match t {
        BankEntryType::FundWire => "FUND",
        BankEntryType::PatientCheck => "CHECK",
        BankEntryType::PatientCreditCard => "CREDIT_CARD",
        BankEntryType::PatientCash => "CASH",
        BankEntryType::FundOutgoingWire => "OUTGOING_WIRE",
    }
}

fn parse_transfer_type(type_str: &str) -> BankEntryType {
    match type_str {
        "FUND" => BankEntryType::FundWire,
        "CHECK" => BankEntryType::PatientCheck,
        "CREDIT_CARD" => BankEntryType::PatientCreditCard,
        "CASH" => BankEntryType::PatientCash,
        "OUTGOING_WIRE" => BankEntryType::FundOutgoingWire,
        other => unreachable!("Unknown transfer_type in database: {}", other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_transfer_type_roundtrip() {
        for t in [
            BankEntryType::FundWire,
            BankEntryType::PatientCheck,
            BankEntryType::PatientCreditCard,
            BankEntryType::PatientCash,
            BankEntryType::FundOutgoingWire,
        ] {
            assert_eq!(parse_transfer_type(transfer_type_to_str(t)), t);
        }
    }
}
