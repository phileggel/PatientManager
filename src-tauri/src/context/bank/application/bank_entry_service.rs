use std::sync::Arc;

use crate::{
    context::bank::{BankAccountRepository, BankEntry, BankEntryRepository, BankEntryType},
    shared::event_bus::{BankEntryUpdated, EventBus},
};

/// Application service for bank transfer operations
pub struct BankEntryService {
    repository: Arc<dyn BankEntryRepository>,
    account_repository: Arc<dyn BankAccountRepository>,
    event_bus: Arc<EventBus>,
}

impl BankEntryService {
    pub fn new(
        repository: Arc<dyn BankEntryRepository>,
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
        transfer_type: BankEntryType,
        bank_account_id: String,
        is_silent: bool,
    ) -> anyhow::Result<BankEntry> {
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
            let _ = self.event_bus.publish::<BankEntryUpdated>(BankEntryUpdated);
        }

        Ok(transfer)
    }

    /// Read a single transfer with account info
    pub async fn read_transfer(&self, id: &str) -> anyhow::Result<Option<BankEntry>> {
        self.repository.read_transfer(id).await
    }

    /// Read all transfers with account info
    pub async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankEntry>> {
        self.repository.read_all_transfers().await
    }

    /// Update an existing transfer
    pub async fn update_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
        // Validate that the bank account exists
        self.account_repository
            .read_account(&transfer.bank_account.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Bank account not found"))?;

        let updated = self.repository.update_transfer(transfer).await?;

        // Publish event
        let _ = self.event_bus.publish::<BankEntryUpdated>(BankEntryUpdated);

        Ok(updated)
    }

    /// Persist a fully-constructed BankEntry directly, bypassing amount validation.
    /// Used for overpayment refund transfers which carry a negative amount (REF-110).
    /// Validates that the bank account exists before persisting.
    pub async fn persist_refund_transfer(
        &self,
        transfer: crate::context::bank::domain::BankEntry,
        is_silent: bool,
    ) -> anyhow::Result<crate::context::bank::domain::BankEntry> {
        self.account_repository
            .read_account(&transfer.bank_account.id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Bank account not found"))?;

        let persisted = self.repository.persist_transfer(transfer).await?;

        if !is_silent {
            let _ = self.event_bus.publish::<BankEntryUpdated>(BankEntryUpdated);
        }

        Ok(persisted)
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
        let _ = self.event_bus.publish::<BankEntryUpdated>(BankEntryUpdated);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::context::bank::BankAccount;

    use super::*;
    use anyhow::anyhow;

    // ============ BankEntryService Tests ============

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

        async fn find_by_iban_including_deleted(
            &self,
            _iban: &str,
        ) -> anyhow::Result<Option<BankAccount>> {
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

    struct MockBankEntryRepository {
        should_fail: bool,
    }

    #[async_trait::async_trait]
    impl BankEntryRepository for MockBankEntryRepository {
        async fn create_transfer(
            &self,
            transfer_date: String,
            amount: i64,
            transfer_type: BankEntryType,
            bank_account: BankAccount,
        ) -> anyhow::Result<BankEntry> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            BankEntry::new(transfer_date, amount, transfer_type, bank_account)
        }

        async fn read_transfer(&self, _id: &str) -> anyhow::Result<Option<BankEntry>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            let account =
                BankAccount::restore("acc-123".to_string(), "Main Account".to_string(), None);
            let transfer = BankEntry::with_id(
                "test-id".to_string(),
                "2026-02-15".to_string(),
                1000000,
                BankEntryType::FundWire,
                account,
            )?;
            Ok(Some(transfer))
        }

        async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankEntry>> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(vec![])
        }

        async fn update_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
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

        async fn persist_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(transfer)
        }
    }

    struct MockBankAccountRepositoryReturnsNone;

    #[async_trait::async_trait]
    impl BankAccountRepository for MockBankAccountRepositoryReturnsNone {
        async fn create_account(&self, a: BankAccount) -> anyhow::Result<BankAccount> {
            Ok(a)
        }
        async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>> {
            Ok(vec![])
        }
        async fn find_by_iban(&self, _: &str) -> anyhow::Result<Option<BankAccount>> {
            Ok(None)
        }
        async fn find_by_iban_including_deleted(
            &self,
            _: &str,
        ) -> anyhow::Result<Option<BankAccount>> {
            Ok(None)
        }
        async fn read_account(&self, _: &str) -> anyhow::Result<Option<BankAccount>> {
            Ok(None)
        }
        async fn update_account(&self, a: BankAccount) -> anyhow::Result<BankAccount> {
            Ok(a)
        }
        async fn delete_account(&self, _: &str) -> anyhow::Result<()> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn test_create_transfer_success() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service
            .create_transfer(
                "2026-02-15".to_string(),
                1500000,
                BankEntryType::FundWire,
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
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service
            .create_transfer(
                "2026-02-15".to_string(),
                -100000,
                BankEntryType::FundWire,
                "acc-123".to_string(),
                false,
            )
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("greater than 0"));
    }

    #[tokio::test]
    async fn test_delete_transfer_success() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.delete_transfer("test-id").await;

        assert!(result.is_ok());
    }

    // ============ BankEntryService additional tests ============

    struct MockBankEntryRepositoryReturnsNone;

    #[async_trait::async_trait]
    impl BankEntryRepository for MockBankEntryRepositoryReturnsNone {
        async fn create_transfer(
            &self,
            transfer_date: String,
            amount: i64,
            transfer_type: BankEntryType,
            bank_account: BankAccount,
        ) -> anyhow::Result<BankEntry> {
            BankEntry::new(transfer_date, amount, transfer_type, bank_account)
        }
        async fn read_transfer(&self, _id: &str) -> anyhow::Result<Option<BankEntry>> {
            Ok(None)
        }
        async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankEntry>> {
            Ok(vec![])
        }
        async fn update_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
            Ok(transfer)
        }
        async fn delete_transfer(&self, _id: &str) -> anyhow::Result<()> {
            Ok(())
        }
        async fn persist_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
            Ok(transfer)
        }
    }

    #[tokio::test]
    async fn test_read_transfer_returns_some() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.read_transfer("test-id").await;

        assert!(result.is_ok());
        assert!(result.unwrap().is_some());
    }

    #[tokio::test]
    async fn test_read_all_transfers_returns_list() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.read_all_transfers().await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_update_transfer_success() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let account = BankAccount::restore("acc-123".to_string(), "Main Account".to_string(), None);
        let transfer = BankEntry::with_id(
            "entry-1".to_string(),
            "2026-03-01".to_string(),
            200000,
            BankEntryType::FundWire,
            account,
        )
        .unwrap();

        let result = service.update_transfer(transfer).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().amount, 200000);
    }

    #[tokio::test]
    async fn test_update_transfer_account_not_found() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepositoryReturnsNone);
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let account = BankAccount::restore("missing-acc".to_string(), "Ghost".to_string(), None);
        let transfer = BankEntry::with_id(
            "entry-1".to_string(),
            "2026-03-01".to_string(),
            200000,
            BankEntryType::FundWire,
            account,
        )
        .unwrap();

        let result = service.update_transfer(transfer).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[tokio::test]
    async fn test_persist_refund_transfer_success() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let account = BankAccount::restore("acc-123".to_string(), "Main Account".to_string(), None);
        let transfer = BankEntry::restore(
            "refund-1".to_string(),
            "2026-03-01".to_string(),
            -50000,
            BankEntryType::FundOutgoingWire,
            account,
        );

        let result = service.persist_refund_transfer(transfer, false).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().amount, -50000);
    }

    #[tokio::test]
    async fn test_persist_refund_transfer_account_not_found() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepositoryReturnsNone);
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let account = BankAccount::restore("missing-acc".to_string(), "Ghost".to_string(), None);
        let transfer = BankEntry::restore(
            "refund-1".to_string(),
            "2026-03-01".to_string(),
            -50000,
            BankEntryType::FundOutgoingWire,
            account,
        );

        let result = service.persist_refund_transfer(transfer, false).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[tokio::test]
    async fn test_delete_transfer_not_found() {
        let repo = Arc::new(MockBankEntryRepositoryReturnsNone);
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.delete_transfer("missing-id").await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[tokio::test]
    async fn test_create_transfer_account_not_found() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepositoryReturnsNone);
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service
            .create_transfer(
                "2026-02-15".to_string(),
                1000000,
                BankEntryType::FundWire,
                "missing-acc".to_string(),
                false,
            )
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }
}
