use anyhow::Context;
use sqlx::SqlitePool;

use crate::context::bank::domain::BankAccount;

/// BankAccountRepository trait defines the contract for bank account data access
#[async_trait::async_trait]
pub trait BankAccountRepository: Send + Sync {
    async fn create_account(&self, account: BankAccount) -> anyhow::Result<BankAccount>;
    async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>>;
    async fn read_account(&self, id: &str) -> anyhow::Result<Option<BankAccount>>;
    async fn find_by_iban(&self, iban: &str) -> anyhow::Result<Option<BankAccount>>;
    async fn update_account(&self, account: BankAccount) -> anyhow::Result<BankAccount>;
    async fn delete_account(&self, id: &str) -> anyhow::Result<()>;
}

pub struct SqliteBankAccountRepository {
    pool: SqlitePool,
}

impl SqliteBankAccountRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl BankAccountRepository for SqliteBankAccountRepository {
    async fn create_account(&self, account: BankAccount) -> anyhow::Result<BankAccount> {
        tracing::trace!(account_id = %account.id, name = ?account.name, "Inserting bank account into database");

        sqlx::query!(
            r#"
            INSERT INTO bank_account (id, name, iban, is_deleted)
            VALUES ($1, $2, $3, 0)
            "#,
            account.id,
            account.name,
            account.iban,
        )
        .execute(&self.pool)
        .await?;

        tracing::trace!(account_id = %account.id, "Bank account inserted successfully");

        Ok(BankAccount::restore(account.id, account.name, account.iban))
    }

    async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>> {
        tracing::trace!("Fetching all bank accounts from database");

        let rows = sqlx::query!(
            r#"
            SELECT id, name, iban
            FROM bank_account
            WHERE is_deleted = 0
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
        tracing::trace!(account_id = %id, "Fetching bank account from database");

        let row = sqlx::query!(
            r#"
            SELECT id, name, iban
            FROM bank_account
            WHERE id = $1 AND is_deleted = 0
            "#,
            id,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| BankAccount::restore(r.id, r.name, r.iban)))
    }

    async fn find_by_iban(&self, iban: &str) -> anyhow::Result<Option<BankAccount>> {
        tracing::trace!(iban = %iban, "Finding bank account by IBAN");

        let row = sqlx::query!(
            r#"
            SELECT id, name, iban
            FROM bank_account
            WHERE iban = $1 AND is_deleted = 0
            "#,
            iban,
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| BankAccount::restore(r.id, r.name, r.iban)))
    }

    async fn update_account(&self, account: BankAccount) -> anyhow::Result<BankAccount> {
        tracing::trace!(account_id = %account.id, name = ?account.name, "Updating bank account in database");

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

        tracing::trace!(account_id = %account.id, "Bank account updated successfully");
        Ok(account.clone())
    }

    async fn delete_account(&self, id: &str) -> anyhow::Result<()> {
        tracing::trace!(account_id = %id, "Soft-deleting bank account from database");

        sqlx::query!(r#"UPDATE bank_account SET is_deleted = 1 WHERE id = ?"#, id)
            .execute(&self.pool)
            .await
            .context("Failed to soft-delete bank account")?;

        tracing::trace!(account_id = %id, "Bank account soft-deleted successfully");
        Ok(())
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
        // Migration seeds a default cash account, so 2 created + 1 seeded = 3
        assert_eq!(accounts.len(), 3);
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
}
