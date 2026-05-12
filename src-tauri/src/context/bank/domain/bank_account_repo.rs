use crate::context::bank::BankAccount;

/// BankAccountRepository trait defines the contract for bank account data access
#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait BankAccountRepository: Send + Sync {
    async fn create_account(&self, account: BankAccount) -> anyhow::Result<BankAccount>;
    async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>>;
    async fn read_account(&self, id: &str) -> anyhow::Result<Option<BankAccount>>;
    async fn find_by_iban(&self, iban: &str) -> anyhow::Result<Option<BankAccount>>;
    /// R5 — uniqueness check that scans soft-deleted rows too.
    /// `find_by_iban` excludes deletions and is used for resolution; this method
    /// is reserved for the create/update guards so that a deleted account's
    /// IBAN cannot be silently reused.
    async fn find_by_iban_including_deleted(
        &self,
        iban: &str,
    ) -> anyhow::Result<Option<BankAccount>>;
    async fn update_account(&self, account: BankAccount) -> anyhow::Result<BankAccount>;
    async fn delete_account(&self, id: &str) -> anyhow::Result<()>;
}
