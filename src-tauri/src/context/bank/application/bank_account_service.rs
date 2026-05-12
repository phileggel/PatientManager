use std::sync::Arc;

use crate::{
    context::bank::{BankAccount, BankAccountRepository, CASH_ACCOUNT_ID},
    shared::event_bus::{BankAccountUpdated, EventBus},
};

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

    /// R5 — IBAN uniqueness guard shared by create + update paths.
    /// `exempt_id` lets `update_account` allow self-matches (renaming an account
    /// without changing its IBAN must succeed). `None` rejects any match.
    async fn ensure_iban_unique(
        &self,
        iban: Option<&str>,
        exempt_id: Option<&str>,
    ) -> anyhow::Result<()> {
        let Some(iban) = iban else { return Ok(()) };
        let Some(other) = self.repository.find_by_iban_including_deleted(iban).await? else {
            return Ok(());
        };
        if exempt_id.is_some_and(|id| id == other.id) {
            return Ok(());
        }
        anyhow::bail!("IbanAlreadyUsed");
    }

    /// Create a new bank account
    pub async fn create_account(
        &self,
        name: String,
        iban: Option<String>,
    ) -> anyhow::Result<BankAccount> {
        // R5 — Normalize and check IBAN uniqueness BEFORE calling the factory.
        let normalized_iban = BankAccount::normalize_iban(iban.as_deref());
        self.ensure_iban_unique(normalized_iban.as_deref(), None)
            .await?;
        let account = BankAccount::new(name, iban)?;
        let created = self.repository.create_account(account).await?;

        // Publish event
        let _ = self
            .event_bus
            .publish::<BankAccountUpdated>(BankAccountUpdated);

        Ok(created)
    }

    /// Read a single account — fails with `NotFound` if the account does not exist.
    pub async fn read_account(&self, id: &str) -> anyhow::Result<BankAccount> {
        self.repository
            .read_account(id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("Bank account not found: {}", id))
    }

    /// Read all accounts
    pub async fn read_all_accounts(&self) -> anyhow::Result<Vec<BankAccount>> {
        self.repository.read_all_accounts().await
    }

    /// Find account by IBAN
    pub async fn find_account_by_iban(&self, iban: &str) -> anyhow::Result<Option<BankAccount>> {
        self.repository.find_by_iban(iban).await
    }

    /// Update an existing account — fails with `CashAccountProtected` for the default cash account (R4).
    pub async fn update_account(
        &self,
        id: String,
        name: String,
        iban: Option<String>,
    ) -> anyhow::Result<BankAccount> {
        if id == CASH_ACCOUNT_ID {
            anyhow::bail!("Cash account is protected and cannot be modified");
        }
        // R5 — Normalize and check IBAN uniqueness BEFORE calling the factory.
        // Self-match (same id) is allowed via the exempt_id arg.
        let normalized_iban = BankAccount::normalize_iban(iban.as_deref());
        self.ensure_iban_unique(normalized_iban.as_deref(), Some(&id))
            .await?;
        let account = BankAccount::with_id(id, name, iban)?;
        let updated = self.repository.update_account(account).await?;

        // Publish event
        let _ = self
            .event_bus
            .publish::<BankAccountUpdated>(BankAccountUpdated);

        Ok(updated)
    }

    /// Soft-delete an account — fails with `CashAccountProtected` for the default cash account (R4).
    pub async fn delete_account(&self, id: &str) -> anyhow::Result<()> {
        if id == CASH_ACCOUNT_ID {
            anyhow::bail!("Cash account is protected and cannot be deleted");
        }
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

    // ============ BankAccountService Tests ============

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

    #[tokio::test]
    async fn test_read_account_not_found() {
        struct NotFoundRepo;

        #[async_trait::async_trait]
        impl BankAccountRepository for NotFoundRepo {
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

        let service = BankAccountService::new(Arc::new(NotFoundRepo), Arc::new(EventBus::new()));
        let result = service.read_account("missing-id").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[tokio::test]
    async fn test_update_cash_account_is_protected() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .update_account(CASH_ACCOUNT_ID.to_string(), "New Name".to_string(), None)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("protected"));
    }

    #[tokio::test]
    async fn test_delete_cash_account_is_protected() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.delete_account(CASH_ACCOUNT_ID).await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("protected"));
    }

    // ============ Additional mock helpers ============

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

    // ============ BankAccountService additional tests ============

    #[tokio::test]
    async fn test_read_account_success() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.read_account("test-id").await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().name, "Test Account");
    }

    #[tokio::test]
    async fn test_read_all_accounts_returns_list() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.read_all_accounts().await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_find_account_by_iban_returns_none() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.find_account_by_iban("FR76123456").await;

        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_update_account_success() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .update_account("some-id".to_string(), "Updated Name".to_string(), None)
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().name, "Updated Name");
    }

    #[tokio::test]
    async fn test_delete_account_not_found() {
        let repo = Arc::new(MockBankAccountRepositoryReturnsNone);
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.delete_account("missing-id").await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    // ============ R5 IBAN uniqueness tests ============

    /// Mock whose `find_by_iban_including_deleted` always returns the fixed account supplied at construction.
    struct IbanUniquenessRepo {
        existing: Option<BankAccount>,
    }

    #[async_trait::async_trait]
    impl BankAccountRepository for IbanUniquenessRepo {
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
            _iban: &str,
        ) -> anyhow::Result<Option<BankAccount>> {
            Ok(self.existing.clone())
        }
        async fn read_account(&self, _id: &str) -> anyhow::Result<Option<BankAccount>> {
            Ok(self.existing.clone())
        }
        async fn update_account(&self, a: BankAccount) -> anyhow::Result<BankAccount> {
            Ok(a)
        }
        async fn delete_account(&self, _: &str) -> anyhow::Result<()> {
            Ok(())
        }
    }

    /// Mock that panics if `find_by_iban_including_deleted` is ever called.
    /// Used to assert the uniqueness check is skipped when iban is None.
    struct IbanCheckMustNotBeCalledRepo;

    #[async_trait::async_trait]
    impl BankAccountRepository for IbanCheckMustNotBeCalledRepo {
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
            _iban: &str,
        ) -> anyhow::Result<Option<BankAccount>> {
            panic!("find_by_iban_including_deleted must NOT be called when iban is None");
        }
        async fn read_account(&self, _id: &str) -> anyhow::Result<Option<BankAccount>> {
            Ok(None)
        }
        async fn update_account(&self, a: BankAccount) -> anyhow::Result<BankAccount> {
            Ok(a)
        }
        async fn delete_account(&self, _: &str) -> anyhow::Result<()> {
            Ok(())
        }
    }

    // R5 — create rejects an IBAN already used by an active account
    #[tokio::test]
    async fn test_create_account_rejects_duplicate_iban_active() {
        let existing = BankAccount::restore(
            "existing-id".to_string(),
            "Existing Account".to_string(),
            Some("FR7611111111111111111111111".to_string()),
        );
        let repo = Arc::new(IbanUniquenessRepo {
            existing: Some(existing),
        });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .create_account(
                "New Account".to_string(),
                Some("FR7611111111111111111111111".to_string()),
            )
            .await;

        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.starts_with("IbanAlreadyUsed"),
            "expected error to start with 'IbanAlreadyUsed', got: {msg}"
        );
    }

    // R5 — create rejects an IBAN already used by a soft-deleted account
    #[tokio::test]
    async fn test_create_account_rejects_duplicate_iban_soft_deleted() {
        // The soft-deleted account is returned by find_by_iban_including_deleted
        // regardless of its deletion status — the repo mock does not distinguish.
        let soft_deleted = BankAccount::restore(
            "deleted-id".to_string(),
            "Old Account".to_string(),
            Some("FR7622222222222222222222222".to_string()),
        );
        let repo = Arc::new(IbanUniquenessRepo {
            existing: Some(soft_deleted),
        });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .create_account(
                "New Account".to_string(),
                Some("FR7622222222222222222222222".to_string()),
            )
            .await;

        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.starts_with("IbanAlreadyUsed"),
            "expected error to start with 'IbanAlreadyUsed', got: {msg}"
        );
    }

    // R5 — create with iban = None must skip the uniqueness check entirely
    #[tokio::test]
    async fn test_create_account_allows_no_iban() {
        // IbanCheckMustNotBeCalledRepo panics if find_by_iban_including_deleted is invoked.
        let repo = Arc::new(IbanCheckMustNotBeCalledRepo);
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        // Must succeed without touching the IBAN uniqueness path
        let result = service
            .create_account("Account Without IBAN".to_string(), None)
            .await;

        assert!(
            result.is_ok(),
            "create with iban=None must succeed; got: {:?}",
            result.unwrap_err()
        );
    }

    // R5 — update rejects an IBAN already used by a *different* account
    #[tokio::test]
    async fn test_update_account_rejects_iban_used_by_another_account() {
        let conflicting = BankAccount::restore(
            "other-id".to_string(),
            "Other Account".to_string(),
            Some("FR7633333333333333333333333".to_string()),
        );
        let repo = Arc::new(IbanUniquenessRepo {
            existing: Some(conflicting),
        });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .update_account(
                "my-id".to_string(),
                "My Account".to_string(),
                Some("FR7633333333333333333333333".to_string()),
            )
            .await;

        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.starts_with("IbanAlreadyUsed"),
            "expected error to start with 'IbanAlreadyUsed', got: {msg}"
        );
    }

    // R5 — update with same IBAN on the *same* account must succeed (self-match)
    #[tokio::test]
    async fn test_update_account_allows_self_match_iban() {
        // The row returned by find_by_iban_including_deleted has the SAME id as the account
        // being updated — this is a self-match and must NOT be treated as a conflict.
        let self_account = BankAccount::restore(
            "my-id".to_string(),
            "My Account".to_string(),
            Some("FR7644444444444444444444444".to_string()),
        );
        let repo = Arc::new(IbanUniquenessRepo {
            existing: Some(self_account),
        });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .update_account(
                "my-id".to_string(),
                "My Account (renamed)".to_string(),
                Some("FR7644444444444444444444444".to_string()),
            )
            .await;

        assert!(
            result.is_ok(),
            "self-match IBAN on update must succeed; got: {:?}",
            result.unwrap_err()
        );
    }
}
