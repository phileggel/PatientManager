use std::sync::Arc;

use super::domain::{BankAccount, BankTransfer, BankTransferType};
use super::repository::{BankAccountRepository, BankTransferRepository};
use crate::core::event_bus::event::{BankAccountUpdated, BankTransferUpdated};
use crate::core::event_bus::EventBus;

// ============ BankTransferService ============

/// Application service for bank transfer operations
pub struct BankTransferService {
    repository: Arc<dyn BankTransferRepository>,
    account_repository: Arc<dyn BankAccountRepository>,
    event_bus: Arc<EventBus>,
}

impl BankTransferService {
    pub fn new(
        repository: Arc<dyn BankTransferRepository>,
        account_repository: Arc<dyn BankAccountRepository>,
        event_bus: Arc<EventBus>,
    ) -> Self {
        Self {
            repository,
            account_repository,
            event_bus,
        }
    }

    /// Create a new bank transfer
    pub async fn create_transfer(
        &self,
        transfer_date: String,
        amount: i64,
        transfer_type: BankTransferType,
        bank_account_id: String,
        is_silent: bool,
    ) -> anyhow::Result<BankTransfer> {
        // Fetch and validate bank account exists
        let bank_account = self
            .account_repository
            .read_account(&bank_account_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Bank account not found"))?;

        let transfer = self
            .repository
            .create_transfer(transfer_date, amount, transfer_type, bank_account)
            .await?;

        // Publish event
        if !is_silent {
            let _ = self
                .event_bus
                .publish::<BankTransferUpdated>(BankTransferUpdated);
        }

        Ok(transfer)
    }

    /// Read a single transfer with account info
    pub async fn read_transfer(&self, id: &str) -> anyhow::Result<Option<BankTransfer>> {
        self.repository.read_transfer(id).await
    }

    /// Read all transfers with account info
    pub async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankTransfer>> {
        self.repository.read_all_transfers().await
    }

    /// Update an existing transfer
    pub async fn update_transfer(&self, transfer: BankTransfer) -> anyhow::Result<BankTransfer> {
        // Validate that the bank account exists
        self.account_repository
            .read_account(&transfer.bank_account.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Bank account not found"))?;

        let updated = self.repository.update_transfer(transfer).await?;

        // Publish event
        let _ = self
            .event_bus
            .publish::<BankTransferUpdated>(BankTransferUpdated);

        Ok(updated)
    }

    /// Soft-delete a transfer
    pub async fn delete_transfer(&self, id: &str) -> anyhow::Result<()> {
        // Verify transfer exists
        self.repository
            .read_transfer(id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Transfer not found"))?;

        self.repository.delete_transfer(id).await?;

        // Publish event
        let _ = self
            .event_bus
            .publish::<BankTransferUpdated>(BankTransferUpdated);

        Ok(())
    }
}

// ============ BankAccountService ============

/// Application service for bank account operations
pub struct BankAccountService {
    repository: Arc<dyn BankAccountRepository>,
    event_bus: Arc<EventBus>,
}

impl BankAccountService {
    pub fn new(repository: Arc<dyn BankAccountRepository>, event_bus: Arc<EventBus>) -> Self {
        Self {
            repository,
            event_bus,
        }
    }

    /// Create a new bank account
    pub async fn create_account(
        &self,
        name: String,
        iban: Option<String>,
    ) -> anyhow::Result<BankAccount> {
        let account = BankAccount::new(name, iban)?;
        let created = self.repository.create_account(account).await?;

        // Publish event
        let _ = self
            .event_bus
            .publish::<BankAccountUpdated>(BankAccountUpdated);

        Ok(created)
    }

    /// Read a single account
    pub async fn read_account(&self, id: &str) -> anyhow::Result<Option<BankAccount>> {
        self.repository.read_account(id).await
    }

    /// Read all accounts
    pub async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>> {
        self.repository.read_all_accounts().await
    }

    /// Find account by IBAN
    pub async fn find_account_by_iban(&self, iban: &str) -> anyhow::Result<Option<BankAccount>> {
        self.repository.find_by_iban(iban).await
    }

    /// Update an existing account
    pub async fn update_account(
        &self,
        id: String,
        name: String,
        iban: Option<String>,
    ) -> anyhow::Result<BankAccount> {
        let account = BankAccount::with_id(id, name, iban)?;
        let updated = self.repository.update_account(account).await?;

        // Publish event
        let _ = self
            .event_bus
            .publish::<BankAccountUpdated>(BankAccountUpdated);

        Ok(updated)
    }

    /// Soft-delete an account
    pub async fn delete_account(&self, id: &str) -> anyhow::Result<()> {
        // Verify account exists
        self.repository
            .read_account(id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Bank account not found"))?;

        self.repository.delete_account(id).await?;

        // Publish event
        let _ = self
            .event_bus
            .publish::<BankAccountUpdated>(BankAccountUpdated);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::anyhow;

    // ============ BankTransferService Tests ============

    struct MockBankTransferRepository {
        should_fail: bool,
    }

    #[async_trait::async_trait]
    impl BankTransferRepository for MockBankTransferRepository {
        async fn create_transfer(
            &self,
            transfer_date: String,
            amount: i64,
            transfer_type: BankTransferType,
            bank_account: BankAccount,
        ) -> anyhow::Result<BankTransfer> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            BankTransfer::new(transfer_date, amount, transfer_type, bank_account)
        }

        async fn read_transfer(&self, _id: &str) -> anyhow::Result<Option<BankTransfer>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            let account =
                BankAccount::restore("acc-123".to_string(), "Main Account".to_string(), None);
            let transfer = BankTransfer::with_id(
                "test-id".to_string(),
                "2026-02-15".to_string(),
                1000000,
                BankTransferType::Fund,
                account,
            )?;
            Ok(Some(transfer))
        }

        async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankTransfer>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(vec![])
        }

        async fn update_transfer(&self, transfer: BankTransfer) -> anyhow::Result<BankTransfer> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(transfer)
        }

        async fn delete_transfer(&self, _id: &str) -> anyhow::Result<()> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_create_transfer_success() {
        let repo = Arc::new(MockBankTransferRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankTransferService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service
            .create_transfer(
                "2026-02-15".to_string(),
                1500000,
                BankTransferType::Fund,
                "acc-123".to_string(),
                false,
            )
            .await;

        assert!(result.is_ok());
        let transfer = result.unwrap();
        assert_eq!(transfer.amount, 1500000);
    }

    #[tokio::test]
    async fn test_create_transfer_invalid_amount() {
        let repo = Arc::new(MockBankTransferRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankTransferService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service
            .create_transfer(
                "2026-02-15".to_string(),
                -100000,
                BankTransferType::Fund,
                "acc-123".to_string(),
                false,
            )
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("greater than 0"));
    }

    #[tokio::test]
    async fn test_delete_transfer_success() {
        let repo = Arc::new(MockBankTransferRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankTransferService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.delete_transfer("test-id").await;

        assert!(result.is_ok());
    }

    // ============ BankAccountService Tests ============

    struct MockBankAccountRepository {
        should_fail: bool,
    }

    #[async_trait::async_trait]
    impl BankAccountRepository for MockBankAccountRepository {
        async fn create_account(&self, account: BankAccount) -> anyhow::Result<BankAccount> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(account)
        }

        async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(vec![])
        }

        async fn find_by_iban(&self, _iban: &str) -> anyhow::Result<Option<BankAccount>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(None)
        }

        async fn read_account(&self, _id: &str) -> anyhow::Result<Option<BankAccount>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(Some(BankAccount::restore(
                "test-id".to_string(),
                "Test Account".to_string(),
                None,
            )))
        }

        async fn update_account(&self, account: BankAccount) -> anyhow::Result<BankAccount> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(account)
        }

        async fn delete_account(&self, _id: &str) -> anyhow::Result<()> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_create_account_success() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .create_account("Main Account".to_string(), None)
            .await;

        assert!(result.is_ok());
        let account = result.unwrap();
        assert_eq!(account.name, "Main Account");
    }

    #[tokio::test]
    async fn test_create_account_trims_whitespace() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .create_account("  Test Account  ".to_string(), None)
            .await;

        assert!(result.is_ok());
        let account = result.unwrap();
        assert_eq!(account.name, "Test Account");
    }

    #[tokio::test]
    async fn test_create_account_empty() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.create_account("".to_string(), None).await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_delete_account_success() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.delete_account("test-id").await;

        assert!(result.is_ok());
    }
}
