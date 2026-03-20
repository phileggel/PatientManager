use anyhow::Context;
use sqlx::SqlitePool;

use crate::context::bank::domain::{BankAccount, BankTransfer, BankTransferType};

/// BankTransferRepository trait defines the contract for bank transfer data access
#[async_trait::async_trait]
pub trait BankTransferRepository: Send + Sync {
    /// Create a new bank transfer
    async fn create_transfer(
        &self,
        transfer_date: String,
        amount: i64,
        transfer_type: BankTransferType,
        bank_account: BankAccount,
    ) -> anyhow::Result<BankTransfer>;

    /// Read a single transfer by ID with bank account info
    async fn read_transfer(&self, id: &str) -> anyhow::Result<Option<BankTransfer>>;

    /// Read all transfers with bank account info
    async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankTransfer>>;

    /// Update an existing transfer
    async fn update_transfer(&self, transfer: BankTransfer) -> anyhow::Result<BankTransfer>;

    /// Hard-delete a transfer (permanent)
    async fn delete_transfer(&self, id: &str) -> anyhow::Result<()>;
}

pub struct SqliteBankTransferRepository {
    pool: SqlitePool,
}

impl SqliteBankTransferRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl BankTransferRepository for SqliteBankTransferRepository {
    async fn create_transfer(
        &self,
        transfer_date: String,
        amount: i64,
        transfer_type: BankTransferType,
        bank_account: BankAccount,
    ) -> anyhow::Result<BankTransfer> {
        let transfer = BankTransfer::new(transfer_date, amount, transfer_type, bank_account)?;

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

    async fn read_transfer(&self, id: &str) -> anyhow::Result<Option<BankTransfer>> {
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
            BankTransfer::restore(
                r.id,
                r.transfer_date,
                r.amount,
                parse_transfer_type(&r.transfer_type),
                account,
            )
        }))
    }

    async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankTransfer>> {
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
                BankTransfer::restore(
                    r.id,
                    r.transfer_date,
                    r.amount,
                    parse_transfer_type(&r.transfer_type),
                    account,
                )
            })
            .collect())
    }

    async fn update_transfer(&self, transfer: BankTransfer) -> anyhow::Result<BankTransfer> {
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
}

fn transfer_type_to_str(t: BankTransferType) -> &'static str {
    match t {
        BankTransferType::Fund => "FUND",
        BankTransferType::Check => "CHECK",
        BankTransferType::CreditCard => "CREDIT_CARD",
        BankTransferType::Cash => "CASH",
    }
}

fn parse_transfer_type(type_str: &str) -> BankTransferType {
    match type_str {
        "FUND" => BankTransferType::Fund,
        "CHECK" => BankTransferType::Check,
        "CREDIT_CARD" => BankTransferType::CreditCard,
        "CASH" => BankTransferType::Cash,
        other => unreachable!("Unknown transfer_type in database: {}", other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_transfer_type_roundtrip() {
        for t in [
            BankTransferType::Fund,
            BankTransferType::Check,
            BankTransferType::CreditCard,
            BankTransferType::Cash,
        ] {
            assert_eq!(parse_transfer_type(transfer_type_to_str(t)), t);
        }
    }
}
