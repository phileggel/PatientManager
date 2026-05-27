use std::sync::Arc;

use crate::{
    context::bank::{
        BankAccountRepository, BankEntry, BankEntryRepository, BankEntryType, BankError,
    },
    shared::{
        event_bus::{BankEntryUpdated, EventBus},
        logger::BACKEND,
    },
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
    ) -> Result<BankEntry, BankError> {
        // Fetch and validate bank account exists
        let bank_account = self
            .account_repository
            .read_account(&bank_account_id)
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "create_transfer: read_account failed");
                BankError::DatabaseError
            })?
            .ok_or_else(|| BankError::BankAccountNotFound {
                bank_account_id: bank_account_id.clone(),
            })?;

        // Domain construction happens in the service so typed domain errors
        // (e.g. `AmountNotPositive`) surface directly — the repo just persists.
        let entry = BankEntry::new(transfer_date, amount, transfer_type, bank_account)?;
        let transfer = self.repository.create_transfer(entry).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "create_transfer: repository failed");
            BankError::DatabaseError
        })?;

        // Publish event
        if !is_silent {
            let _ = self.event_bus.publish::<BankEntryUpdated>(BankEntryUpdated);
        }

        Ok(transfer)
    }

    /// Read a single transfer with account info
    pub async fn read_transfer(&self, id: &str) -> Result<Option<BankEntry>, BankError> {
        self.repository.read_transfer(id).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "read_transfer: repository failed");
            BankError::DatabaseError
        })
    }

    /// Read all transfers with account info
    pub async fn read_all_transfers(&self) -> Result<Vec<BankEntry>, BankError> {
        self.repository.read_all_transfers().await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "read_all_transfers: repository failed");
            BankError::DatabaseError
        })
    }

    /// Update an existing transfer
    pub async fn update_transfer(&self, transfer: BankEntry) -> Result<BankEntry, BankError> {
        // Validate that the bank account exists
        let account_id = transfer.bank_account.id.clone();
        self.account_repository
            .read_account(&account_id)
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "update_transfer: read_account failed");
                BankError::DatabaseError
            })?
            .ok_or(BankError::BankAccountNotFound {
                bank_account_id: account_id,
            })?;

        let updated = self
            .repository
            .update_transfer(transfer)
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "update_transfer: repository failed");
                BankError::DatabaseError
            })?;

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
    ) -> Result<crate::context::bank::domain::BankEntry, BankError> {
        let account_id = transfer.bank_account.id.clone();
        self.account_repository
            .read_account(&account_id)
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "persist_refund_transfer: read_account failed");
                BankError::DatabaseError
            })?
            .ok_or(BankError::BankAccountNotFound {
                bank_account_id: account_id,
            })?;

        let persisted = self.repository.persist_transfer(transfer).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "persist_refund_transfer: repository failed");
            BankError::DatabaseError
        })?;

        if !is_silent {
            let _ = self.event_bus.publish::<BankEntryUpdated>(BankEntryUpdated);
        }

        Ok(persisted)
    }

    /// Soft-delete a transfer
    pub async fn delete_transfer(&self, id: &str) -> Result<(), BankError> {
        // Verify transfer exists
        let row = self.repository.read_transfer(id).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "delete_transfer: read_transfer failed");
            BankError::DatabaseError
        })?;
        if row.is_none() {
            return Err(BankError::TransferNotFound {
                bank_transfer_id: id.to_string(),
            });
        }

        self.repository.delete_transfer(id).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "delete_transfer: repository failed");
            BankError::DatabaseError
        })?;

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
        async fn create_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
            if self.should_fail {
                return Err(anyhow!("Mock repository error"));
            }
            Ok(transfer)
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

        assert!(matches!(result, Err(BankError::AmountNotPositive)));
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
        async fn create_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
            Ok(transfer)
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

        assert!(matches!(result, Err(BankError::BankAccountNotFound { .. })));
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

        assert!(matches!(result, Err(BankError::BankAccountNotFound { .. })));
    }

    #[tokio::test]
    async fn test_delete_transfer_not_found() {
        let repo = Arc::new(MockBankEntryRepositoryReturnsNone);
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.delete_transfer("missing-id").await;

        assert!(matches!(
            result,
            Err(BankError::TransferNotFound { ref bank_transfer_id }) if bank_transfer_id == "missing-id"
        ));
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

        assert!(matches!(result, Err(BankError::BankAccountNotFound { .. })));
    }

    // ============ DatabaseError translation arms ============
    // Each method translates a repository failure into `BankError::DatabaseError`
    // via `.map_err(…)`. These tests drive each `Err` branch that the
    // happy-path / not-found tests above do not reach.

    /// Entry repo whose `read_transfer` returns a row but `delete_transfer`
    /// fails — isolates the delete path's *second* `.map_err` arm (the first,
    /// on `read_transfer`, is covered by the `should_fail` mock).
    struct MockBankEntryRepoReadOkDeleteFails;

    #[async_trait::async_trait]
    impl BankEntryRepository for MockBankEntryRepoReadOkDeleteFails {
        async fn create_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
            Ok(transfer)
        }
        async fn read_transfer(&self, _id: &str) -> anyhow::Result<Option<BankEntry>> {
            let account =
                BankAccount::restore("acc-123".to_string(), "Main Account".to_string(), None);
            Ok(Some(BankEntry::with_id(
                "test-id".to_string(),
                "2026-02-15".to_string(),
                1000000,
                BankEntryType::FundWire,
                account,
            )?))
        }
        async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankEntry>> {
            Ok(vec![])
        }
        async fn update_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
            Ok(transfer)
        }
        async fn delete_transfer(&self, _id: &str) -> anyhow::Result<()> {
            Err(anyhow!("Mock repository error"))
        }
        async fn persist_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry> {
            Ok(transfer)
        }
    }

    #[tokio::test]
    async fn test_create_transfer_read_account_repository_error_translates() {
        // account_repo fails → the `read_account` `.map_err` arm.
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: true });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service
            .create_transfer(
                "2026-02-15".to_string(),
                1000000,
                BankEntryType::FundWire,
                "acc-123".to_string(),
                false,
            )
            .await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_create_transfer_persist_repository_error_translates() {
        // account_repo ok (account found, valid amount) → failure comes from the
        // entry repo's `create_transfer` `.map_err` arm.
        let repo = Arc::new(MockBankEntryRepository { should_fail: true });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service
            .create_transfer(
                "2026-02-15".to_string(),
                1000000,
                BankEntryType::FundWire,
                "acc-123".to_string(),
                false,
            )
            .await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_read_transfer_repository_error_translates() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: true });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.read_transfer("test-id").await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_read_all_transfers_repository_error_translates() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: true });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.read_all_transfers().await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_update_transfer_read_account_repository_error_translates() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: true });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let account = BankAccount::restore("acc-123".to_string(), "Main".to_string(), None);
        let transfer = BankEntry::with_id(
            "entry-1".to_string(),
            "2026-03-01".to_string(),
            200000,
            BankEntryType::FundWire,
            account,
        )
        .unwrap();

        let result = service.update_transfer(transfer).await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_update_transfer_persist_repository_error_translates() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: true });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let account = BankAccount::restore("acc-123".to_string(), "Main".to_string(), None);
        let transfer = BankEntry::with_id(
            "entry-1".to_string(),
            "2026-03-01".to_string(),
            200000,
            BankEntryType::FundWire,
            account,
        )
        .unwrap();

        let result = service.update_transfer(transfer).await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_persist_refund_transfer_read_account_repository_error_translates() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: false });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: true });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let account = BankAccount::restore("acc-123".to_string(), "Main".to_string(), None);
        let transfer = BankEntry::restore(
            "refund-1".to_string(),
            "2026-03-01".to_string(),
            -50000,
            BankEntryType::FundOutgoingWire,
            account,
        );

        let result = service.persist_refund_transfer(transfer, false).await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_persist_refund_transfer_persist_repository_error_translates() {
        let repo = Arc::new(MockBankEntryRepository { should_fail: true });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let account = BankAccount::restore("acc-123".to_string(), "Main".to_string(), None);
        let transfer = BankEntry::restore(
            "refund-1".to_string(),
            "2026-03-01".to_string(),
            -50000,
            BankEntryType::FundOutgoingWire,
            account,
        );

        let result = service.persist_refund_transfer(transfer, false).await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_delete_transfer_read_repository_error_translates() {
        // Entry repo fails on the existence-check `read_transfer` call.
        let repo = Arc::new(MockBankEntryRepository { should_fail: true });
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.delete_transfer("test-id").await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_delete_transfer_delete_repository_error_translates() {
        // Row exists (read_transfer Ok) but the `delete_transfer` call fails,
        // isolating the delete path's second `.map_err` arm.
        let repo = Arc::new(MockBankEntryRepoReadOkDeleteFails);
        let account_repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankEntryService::new(repo, account_repo, Arc::new(EventBus::new()));

        let result = service.delete_transfer("test-id").await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }
}
