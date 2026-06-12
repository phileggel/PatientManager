use crate::context::bank::BankEntry;

/// BankEntryRepository trait defines the contract for bank transfer data access
#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait BankEntryRepository: Send + Sync {
    /// Read a single transfer by ID with bank account info
    async fn read_transfer(&self, id: &str) -> anyhow::Result<Option<BankEntry>>;

    /// Read all transfers with bank account info
    async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankEntry>>;

    /// Update an existing transfer
    async fn update_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry>;

    /// Hard-delete a transfer (permanent)
    async fn delete_transfer(&self, id: &str) -> anyhow::Result<()>;

    /// Persist a fully-constructed BankEntry. Validation lives upstream in the
    /// service: the create path constructs via `BankEntry::new` so typed domain
    /// errors surface there; refund transfers arrive pre-built with a negative
    /// amount via `BankEntry::restore` (REF-110).
    async fn persist_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry>;
}
