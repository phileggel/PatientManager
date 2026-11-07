use crate::context::bank::BankAccount;

/// BankAccountRepository trait defines the contract for bank account data access
#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait BankAccountRepository: Send + Sync {
    async fn create_account(&self, account: BankAccount) -> anyhow::Result<BankAccount>;
    async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>>;
    async fn read_account(&self, id: &str) -> anyhow::Result<Option<BankAccount>>;
    async fn find_by_iban(&self, iban: &str) -> anyhow::Result<Option<BankAccount>>;
    async fn update_account(&self, account: BankAccount) -> anyhow::Result<BankAccount>;
    /// Really deletes the account unless a bank entry is recorded on it (BAC-043);
    /// answers whether it was deleted.
    async fn delete_account(&self, id: &str) -> anyhow::Result<bool>;
    /// BAC-043 — whether any bank entry is recorded on the account.
    async fn holds_bank_entries(&self, id: &str) -> anyhow::Result<bool>;
}
