use anyhow::Context;
use sqlx::SqlitePool;

use crate::context::bank::domain::{BankAccount, BankAccountRepository, BankAccountType};
use crate::shared::logger::BACKEND;

pub struct SqliteBankAccountRepository {
    pool: SqlitePool,
}

impl SqliteBankAccountRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

/// Rebuilds an account from its row, its type included (BAC-050).
pub(super) fn restore_row(
    id: String,
    name: String,
    iban: Option<String>,
    account_type: &str,
) -> anyhow::Result<BankAccount> {
    let account_type = BankAccountType::from_db_str(account_type)
        .with_context(|| format!("Unknown account type {account_type:?} for account {id}"))?;
    Ok(BankAccount::restore_of_type(id, name, iban, account_type))
}

#[async_trait::async_trait]
impl BankAccountRepository for SqliteBankAccountRepository {
    async fn create_account(&self, account: BankAccount) -> anyhow::Result<BankAccount> {
        tracing::trace!(target: BACKEND, account_id = %account.id, name = ?account.name, "Inserting bank account into database");

        sqlx::query!(
            r#"
            INSERT INTO bank_account (id, name, iban)
            VALUES ($1, $2, $3)
            "#,
            account.id,
            account.name,
            account.iban,
        )
        .execute(&self.pool)
        .await?;

        tracing::trace!(target: BACKEND, account_id = %account.id, "Bank account inserted successfully");

        Ok(BankAccount::restore(account.id, account.name, account.iban))
    }

    async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>> {
        tracing::trace!(target: BACKEND, "Fetching all bank accounts from database");

        let rows = sqlx::query!(
            r#"
            SELECT id, name, iban
            FROM bank_account
            WHERE account_type = 'bank'
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| BankAccount::restore(row.id, row.name, row.iban))
            .collect())
    }

    async fn read_account(&self, id: &str) -> anyhow::Result<Option<BankAccount>> {
        tracing::trace!(target: BACKEND, account_id = %id, "Fetching bank account from database");

        let row = sqlx::query!(
            r#"
            SELECT id, name, iban, account_type
            FROM bank_account
            WHERE id = $1
            "#,
            id,
        )
        .fetch_optional(&self.pool)
        .await?;

        row.map(|r| restore_row(r.id, r.name, r.iban, &r.account_type))
            .transpose()
    }

    async fn find_by_iban(&self, iban: &str) -> anyhow::Result<Option<BankAccount>> {
        tracing::trace!(target: BACKEND, "Finding bank account by IBAN");

        let row = sqlx::query!(
            r#"
            SELECT id, name, iban, account_type
            FROM bank_account
            WHERE iban = $1
            "#,
            iban,
        )
        .fetch_optional(&self.pool)
        .await?;

        row.map(|r| restore_row(r.id, r.name, r.iban, &r.account_type))
            .transpose()
    }

    async fn update_account(&self, account: BankAccount) -> anyhow::Result<BankAccount> {
        tracing::trace!(target: BACKEND, account_id = %account.id, name = ?account.name, "Updating bank account in database");

        sqlx::query!(
            r#"
            UPDATE bank_account
            SET name = $1, iban = $2
            WHERE id = $3
            "#,
            account.name,
            account.iban,
            account.id,
        )
        .execute(&self.pool)
        .await
        .context("Failed to update bank account")?;

        tracing::trace!(target: BACKEND, account_id = %account.id, "Bank account updated successfully");
        Ok(account.clone())
    }

    async fn delete_account(&self, id: &str) -> anyhow::Result<bool> {
        tracing::trace!(target: BACKEND, account_id = %id, "Deleting bank account from database");

        // BAC-043 in the statement itself: an entry recorded since the caller's
        // check keeps the account, and the foreign key never refuses the delete.
        let result = sqlx::query!(
            r#"DELETE FROM bank_account
               WHERE id = ?
                 AND NOT EXISTS (SELECT 1 FROM bank_transfer WHERE bank_account_id = ?)"#,
            id,
            id
        )
        .execute(&self.pool)
        .await
        .context("Failed to delete bank account")?;

        let deleted = result.rows_affected() > 0;
        tracing::trace!(target: BACKEND, account_id = %id, deleted, "Bank account deletion ran");
        Ok(deleted)
    }

    async fn holds_bank_entries(&self, id: &str) -> anyhow::Result<bool> {
        let holds = sqlx::query_scalar!(
            r#"SELECT EXISTS (SELECT 1 FROM bank_transfer WHERE bank_account_id = ?) AS "holds!: bool""#,
            id
        )
        .fetch_one(&self.pool)
        .await
        .context("Failed to check the bank account's bank entries")?;
        Ok(holds)
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    async fn setup_test_repo() -> SqliteBankAccountRepository {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to connect to in-memory database");

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("Failed to run migrations");

        SqliteBankAccountRepository { pool }
    }

    #[tokio::test]
    async fn test_create_account() -> anyhow::Result<()> {
        let db = setup_test_repo().await;
        let new_account = BankAccount::new("Main Account".to_string(), None)?;

        let saved_account = db.create_account(new_account.clone()).await?;

        assert_eq!(saved_account.id, new_account.id);
        assert_eq!(saved_account.name, "Main Account");
        assert!(saved_account.iban.is_none());

        Ok(())
    }

    #[tokio::test]
    async fn test_create_account_with_iban() -> anyhow::Result<()> {
        let db = setup_test_repo().await;
        let new_account = BankAccount::new(
            "Main Account".to_string(),
            Some("FR7600000000000000000000000".to_string()),
        )?;

        let saved_account = db.create_account(new_account.clone()).await?;
        assert_eq!(
            saved_account.iban.as_deref(),
            Some("FR7600000000000000000000000")
        );

        Ok(())
    }

    #[tokio::test]
    async fn test_find_by_iban() -> anyhow::Result<()> {
        let db = setup_test_repo().await;
        let iban = "FR7600000000000000000000000";
        let new_account = BankAccount::new("Main Account".to_string(), Some(iban.to_string()))?;
        db.create_account(new_account.clone()).await?;

        let found = db.find_by_iban(iban).await?;
        assert!(found.is_some());
        assert_eq!(
            found.as_ref().map(|a| a.id.as_str()),
            Some(new_account.id.as_str())
        );

        let not_found = db.find_by_iban("FR0000000000000000000000000").await?;
        assert!(not_found.is_none());

        Ok(())
    }

    #[tokio::test]
    async fn test_read_all_accounts() {
        let db = setup_test_repo().await;
        let account1 = BankAccount::new("Account 1".to_string(), None).unwrap();
        let account2 = BankAccount::new("Account 2".to_string(), None).unwrap();

        db.create_account(account1.clone()).await.unwrap();
        db.create_account(account2.clone()).await.unwrap();

        let accounts = db.read_all_accounts().await.unwrap();
        // BAC-055 — the seeded technical accounts are never listed.
        assert_eq!(accounts.len(), 2);
        let technical = db.read_account("check-account-default").await.unwrap();
        assert!(technical.is_some_and(|a| !a.is_bank()));
    }

    #[tokio::test]
    async fn test_read_account() {
        let db = setup_test_repo().await;
        let new_account = BankAccount::new("Test Account".to_string(), None).unwrap();

        db.create_account(new_account.clone()).await.unwrap();

        let found = db.read_account(&new_account.id).await.unwrap();
        assert!(found.is_some());
        assert_eq!(
            found.as_ref().map(|a| a.name.as_str()),
            Some("Test Account")
        );
    }

    #[tokio::test]
    async fn test_update_account() {
        let db = setup_test_repo().await;
        let new_account = BankAccount::new("Original Name".to_string(), None).unwrap();

        db.create_account(new_account.clone()).await.unwrap();

        let updated = BankAccount::with_id(
            new_account.id.clone(),
            "Updated Name".to_string(),
            Some("FR1234".to_string()),
        )
        .unwrap();
        db.update_account(updated.clone()).await.unwrap();

        let found = db.read_account(&new_account.id).await.unwrap();
        let found = found.as_ref();
        assert_eq!(found.map(|a| a.name.as_str()), Some("Updated Name"));
        assert_eq!(found.and_then(|a| a.iban.as_deref()), Some("FR1234"));
    }

    #[tokio::test]
    async fn test_delete_account() {
        let db = setup_test_repo().await;
        let new_account = BankAccount::new("To Delete".to_string(), None).unwrap();

        db.create_account(new_account.clone()).await.unwrap();
        db.delete_account(&new_account.id).await.unwrap();

        let found = db.read_account(&new_account.id).await.unwrap();
        assert!(found.is_none());
    }

    // BAC-041 — a deleted account is really deleted: its IBAN resolves to nothing.
    #[tokio::test]
    async fn test_584_delete_account_really_deletes_it() -> anyhow::Result<()> {
        let db = setup_test_repo().await;
        let iban = "FR7611111111111111111111111";
        let account = BankAccount::new("Deleted Account".to_string(), Some(iban.to_string()))?;
        db.create_account(account.clone()).await?;

        assert!(db.delete_account(&account.id).await?);

        assert!(db.find_by_iban(iban).await?.is_none());
        let rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bank_account WHERE id = ?")
            .bind(&account.id)
            .fetch_one(&db.pool)
            .await?;
        assert_eq!(rows, 0);
        Ok(())
    }

    // BAC-043 — the delete itself keeps an account a bank entry is recorded on,
    // even when the caller's check ran before the entry was written.
    #[tokio::test]
    async fn test_584_delete_account_holding_a_bank_entry_keeps_it() -> anyhow::Result<()> {
        let db = setup_test_repo().await;
        let account = BankAccount::new("Held".to_string(), None)?;
        db.create_account(account.clone()).await?;
        sqlx::query(
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
             VALUES ('t-1', '2026-03-10', 120000, 'CHECK', ?)",
        )
        .bind(&account.id)
        .execute(&db.pool)
        .await?;

        assert!(!db.delete_account(&account.id).await?);

        assert!(db.read_account(&account.id).await?.is_some());
        Ok(())
    }
}
