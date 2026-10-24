use std::sync::Arc;

use crate::{
    context::bank::{BankAccount, BankAccountRepository, BankError, CASH_ACCOUNT_ID},
    shared::{
        event_bus::{BankAccountUpdated, EventBus},
        logger::BACKEND,
    },
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

    /// BAC-014 — IBAN uniqueness guard shared by create + update paths.
    /// `exempt_id` lets `update_account` allow self-matches (renaming an account
    /// without changing its IBAN must succeed). `None` rejects any match.
    async fn ensure_iban_unique(
        &self,
        iban: Option<&str>,
        exempt_id: Option<&str>,
    ) -> Result<(), BankError> {
        let Some(iban) = iban else { return Ok(()) };
        let other = self
            .repository
            .find_by_iban_including_deleted(iban)
            .await
            .map_err(|e| {
                tracing::error!(target: BACKEND, err = ?e, "ensure_iban_unique: repository failed");
                BankError::DatabaseError
            })?;
        let Some(other) = other else { return Ok(()) };
        if exempt_id.is_some_and(|id| id == other.id) {
            return Ok(());
        }
        Err(BankError::IbanAlreadyUsed)
    }

    /// BAC-013 — name uniqueness among the accounts that are not deleted, the
    /// cash account included; `exempt_id` lets an edit keep its own name.
    /// Names are compared exactly, once the factory has trimmed them.
    async fn ensure_name_free(&self, name: &str, exempt_id: Option<&str>) -> Result<(), BankError> {
        let taken = self
            .read_all_accounts()
            .await?
            .iter()
            .any(|other| Some(other.id.as_str()) != exempt_id && other.name == name);
        if taken {
            return Err(BankError::BankAccountNameAlreadyUsed);
        }
        Ok(())
    }

    /// Create a new bank account
    pub async fn create_account(
        &self,
        name: String,
        iban: Option<String>,
    ) -> Result<BankAccount, BankError> {
        // BAC-014 — Normalize and check IBAN uniqueness BEFORE calling the factory.
        let normalized_iban = BankAccount::normalize_iban(iban.as_deref());
        self.ensure_iban_unique(normalized_iban.as_deref(), None)
            .await?;
        let account = BankAccount::new(name, iban)?;
        self.ensure_name_free(&account.name, None).await?;
        let created = self.repository.create_account(account).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "create_account: repository failed");
            BankError::DatabaseError
        })?;

        // Publish event
        let _ = self
            .event_bus
            .publish::<BankAccountUpdated>(BankAccountUpdated);

        Ok(created)
    }

    /// Read a single account — fails with `BankAccountNotFound` if the account does not exist.
    pub async fn read_account(&self, id: &str) -> Result<BankAccount, BankError> {
        let row = self.repository.read_account(id).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "read_account: repository failed");
            BankError::DatabaseError
        })?;
        row.ok_or_else(|| BankError::BankAccountNotFound {
            bank_account_id: id.to_string(),
        })
    }

    /// Read all accounts
    pub async fn read_all_accounts(&self) -> Result<Vec<BankAccount>, BankError> {
        self.repository.read_all_accounts().await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "read_all_accounts: repository failed");
            BankError::DatabaseError
        })
    }

    /// Find account by IBAN
    pub async fn find_account_by_iban(&self, iban: &str) -> Result<Option<BankAccount>, BankError> {
        self.repository.find_by_iban(iban).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "find_account_by_iban: repository failed");
            BankError::DatabaseError
        })
    }

    /// Update an existing account — fails with `ProtectedCashAccount` for the default cash account (BAC-051),
    /// `BankAccountNotFound` for an unknown or deleted one (BAC-030),
    /// `BankAccountNameAlreadyUsed` for a taken name (BAC-013), and
    /// `IbanAlreadyUsed` for a taken IBAN (BAC-014).
    pub async fn update_account(
        &self,
        id: String,
        name: String,
        iban: Option<String>,
    ) -> Result<BankAccount, BankError> {
        if id == CASH_ACCOUNT_ID {
            return Err(BankError::ProtectedCashAccount);
        }
        // BAC-030 — an unknown or deleted account is not edited.
        self.read_account(&id).await?;
        // BAC-014 — Normalize and check IBAN uniqueness BEFORE calling the factory.
        // Self-match (same id) is allowed via the exempt_id arg.
        let normalized_iban = BankAccount::normalize_iban(iban.as_deref());
        self.ensure_iban_unique(normalized_iban.as_deref(), Some(&id))
            .await?;
        let account = BankAccount::with_id(id, name, iban)?;
        self.ensure_name_free(&account.name, Some(&account.id))
            .await?;
        let updated = self.repository.update_account(account).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "update_account: repository failed");
            BankError::DatabaseError
        })?;

        // Publish event
        let _ = self
            .event_bus
            .publish::<BankAccountUpdated>(BankAccountUpdated);

        Ok(updated)
    }

    /// Soft-delete an account — fails with `ProtectedCashAccount` for the default cash account (BAC-051)
    /// and with `BankAccountHoldsBankEntries` while a bank entry is recorded on it (BAC-043).
    pub async fn delete_account(&self, id: &str) -> Result<(), BankError> {
        if id == CASH_ACCOUNT_ID {
            return Err(BankError::ProtectedCashAccount);
        }
        // Verify account exists
        let row = self.repository.read_account(id).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "delete_account: read_account failed");
            BankError::DatabaseError
        })?;
        if row.is_none() {
            return Err(BankError::BankAccountNotFound {
                bank_account_id: id.to_string(),
            });
        }
        let holds_bank_entries = self.repository.holds_bank_entries(id).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "delete_account: holds_bank_entries failed");
            BankError::DatabaseError
        })?;
        if holds_bank_entries {
            return Err(BankError::BankAccountHoldsBankEntries);
        }

        self.repository.delete_account(id).await.map_err(|e| {
            tracing::error!(target: BACKEND, err = ?e, "delete_account: repository failed");
            BankError::DatabaseError
        })?;

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

    /// BAC-043 — an existing account whose bank entries check answers `holds`; `None` fails it.
    struct HoldsBankEntriesRepo {
        holds: Option<bool>,
    }

    #[async_trait::async_trait]
    impl BankAccountRepository for HoldsBankEntriesRepo {
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
        async fn read_account(&self, id: &str) -> anyhow::Result<Option<BankAccount>> {
            Ok(Some(BankAccount::restore(
                id.to_string(),
                "Held".to_string(),
                None,
            )))
        }
        async fn update_account(&self, a: BankAccount) -> anyhow::Result<BankAccount> {
            Ok(a)
        }
        async fn delete_account(&self, _: &str) -> anyhow::Result<()> {
            panic!("an account holding bank entries, or an unknown answer, must not be deleted")
        }
        async fn holds_bank_entries(&self, _: &str) -> anyhow::Result<bool> {
            self.holds.ok_or_else(|| anyhow!("Mock repository error"))
        }
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

        async fn holds_bank_entries(&self, _id: &str) -> anyhow::Result<bool> {
            Ok(false)
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

    // BAC-014 — a provided IBAN with no existing match passes the uniqueness check
    // and the account is created. Exercises `ensure_iban_unique`'s no-conflict
    // branch (the `else { return Ok(()) }` when the lookup returns None) plus
    // the create path carrying a real IBAN value — distinct from the iban=None
    // fast-path covered by `test_create_account_success`.
    #[tokio::test]
    async fn test_create_account_with_unique_iban_succeeds() {
        // MockBankAccountRepository returns None from find_by_iban_including_deleted,
        // so the supplied IBAN is treated as unique.
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .create_account(
                "Main".to_string(),
                Some("FR7611111111111111111111111".to_string()),
            )
            .await;

        assert!(
            result.is_ok(),
            "unique IBAN must pass; got: {:?}",
            result.err()
        );
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

            async fn holds_bank_entries(&self, _id: &str) -> anyhow::Result<bool> {
                Ok(false)
            }
        }

        let service = BankAccountService::new(Arc::new(NotFoundRepo), Arc::new(EventBus::new()));
        let result = service.read_account("missing-id").await;
        assert!(matches!(
            result,
            Err(BankError::BankAccountNotFound { ref bank_account_id }) if bank_account_id == "missing-id"
        ));
    }

    #[tokio::test]
    async fn test_update_cash_account_is_protected() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .update_account(CASH_ACCOUNT_ID.to_string(), "New Name".to_string(), None)
            .await;

        assert!(matches!(result, Err(BankError::ProtectedCashAccount)));
    }

    #[tokio::test]
    async fn test_delete_cash_account_is_protected() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: false });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.delete_account(CASH_ACCOUNT_ID).await;

        assert!(matches!(result, Err(BankError::ProtectedCashAccount)));
    }

    #[tokio::test]
    async fn test_delete_account_holding_bank_entries_is_refused() {
        let repo = Arc::new(HoldsBankEntriesRepo { holds: Some(true) });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.delete_account("acc-held").await;

        assert!(matches!(
            result,
            Err(BankError::BankAccountHoldsBankEntries)
        ));
    }

    #[tokio::test]
    async fn test_delete_account_bank_entries_check_failure_returns_database_error() {
        let repo = Arc::new(HoldsBankEntriesRepo { holds: None });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.delete_account("acc-held").await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
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

        async fn holds_bank_entries(&self, _id: &str) -> anyhow::Result<bool> {
            Ok(false)
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

        assert!(matches!(result, Err(BankError::BankAccountNotFound { .. })));
    }

    // ============ BAC-014 IBAN uniqueness tests ============

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

        async fn holds_bank_entries(&self, _id: &str) -> anyhow::Result<bool> {
            Ok(false)
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

        async fn holds_bank_entries(&self, _id: &str) -> anyhow::Result<bool> {
            Ok(false)
        }
    }

    // BAC-014 — create rejects an IBAN already used by an active account
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

        assert!(matches!(result, Err(BankError::IbanAlreadyUsed)));
    }

    // BAC-014 — create rejects an IBAN already used by a soft-deleted account
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

        assert!(matches!(result, Err(BankError::IbanAlreadyUsed)));
    }

    // BAC-014 — create with iban = None must skip the uniqueness check entirely
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

    // BAC-014 — update rejects an IBAN already used by a *different* account
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

        assert!(matches!(result, Err(BankError::IbanAlreadyUsed)));
    }

    // BAC-014 — update with same IBAN on the *same* account must succeed (self-match)
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

    // ============ DatabaseError translation arms ============
    // Each method translates a repository failure into `BankError::DatabaseError`
    // via `.map_err(…)`. `MockBankAccountRepository { should_fail: true }` makes
    // every repository call return an error, exercising those `Err` branches.

    #[tokio::test]
    async fn test_create_account_repository_error_translates_to_database_error() {
        // Every read succeeds, so the failure is the `create_account` write's own `.map_err` arm.
        let service = BankAccountService::new(Arc::new(WritesFailRepo), Arc::new(EventBus::new()));

        let result = service.create_account("Main".to_string(), None).await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_ensure_iban_unique_repository_error_translates_to_database_error() {
        // Supplying an IBAN forces the uniqueness lookup, whose failure must
        // surface as DatabaseError (not be mistaken for IbanAlreadyUsed).
        let repo = Arc::new(MockBankAccountRepository { should_fail: true });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service
            .create_account(
                "Main".to_string(),
                Some("FR7611111111111111111111111".to_string()),
            )
            .await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_read_account_repository_error_translates_to_database_error() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: true });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.read_account("acc-1").await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_read_all_accounts_repository_error_translates_to_database_error() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: true });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.read_all_accounts().await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_find_account_by_iban_repository_error_translates_to_database_error() {
        let repo = Arc::new(MockBankAccountRepository { should_fail: true });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.find_account_by_iban("FR76123456").await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    /// Mock whose every read succeeds and whose writes fail, so a create or an
    /// update reaches the repository write past its BAC-030 and BAC-013 checks.
    struct WritesFailRepo;

    #[async_trait::async_trait]
    impl BankAccountRepository for WritesFailRepo {
        async fn create_account(&self, _: BankAccount) -> anyhow::Result<BankAccount> {
            Err(anyhow!("Mock repository error"))
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
            Ok(None)
        }
        async fn read_account(&self, id: &str) -> anyhow::Result<Option<BankAccount>> {
            Ok(Some(BankAccount::restore(
                id.to_string(),
                "Main".to_string(),
                None,
            )))
        }
        async fn update_account(&self, _: BankAccount) -> anyhow::Result<BankAccount> {
            Err(anyhow!("Mock repository error"))
        }
        async fn delete_account(&self, _: &str) -> anyhow::Result<()> {
            Ok(())
        }
        async fn holds_bank_entries(&self, _id: &str) -> anyhow::Result<bool> {
            Ok(false)
        }
    }

    #[tokio::test]
    async fn test_update_account_repository_error_translates_to_database_error() {
        let service = BankAccountService::new(Arc::new(WritesFailRepo), Arc::new(EventBus::new()));

        let result = service
            .update_account("acc-1".to_string(), "Renamed".to_string(), None)
            .await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }

    #[tokio::test]
    async fn test_delete_account_repository_error_translates_to_database_error() {
        // The existence check (`read_account`) fails first, exercising the
        // delete path's read `.map_err` arm.
        let repo = Arc::new(MockBankAccountRepository { should_fail: true });
        let service = BankAccountService::new(repo, Arc::new(EventBus::new()));

        let result = service.delete_account("acc-1").await;

        assert!(matches!(result, Err(BankError::DatabaseError)));
    }
}
