use crate::context::bank::BankEntry;

/// BankEntryRepository trait defines the contract for bank transfer data access
#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait BankEntryRepository: Send + Sync {
    /// Persist a validated BankEntry. The service is responsible for calling
    /// `BankEntry::new` first so typed domain errors (e.g. `AmountNotPositive`)
    /// surface directly from the service, not through an `anyhow`-wrapped
    /// downcast.
    async fn create_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry>;

    /// Read a single transfer by ID with bank account info
    async fn read_transfer(&self, id: &str) -> anyhow::Result<Option<BankEntry>>;

    /// Read all transfers with bank account info
    async fn read_all_transfers(&self) -> anyhow::Result<Vec<BankEntry>>;

    /// Update an existing transfer
    async fn update_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry>;

    /// Hard-delete a transfer (permanent)
    async fn delete_transfer(&self, id: &str) -> anyhow::Result<()>;

    /// Persist a fully-constructed BankEntry directly (no factory validation).
    /// Used for overpayment refund transfers which carry a negative amount (REF-110).
    async fn persist_transfer(&self, transfer: BankEntry) -> anyhow::Result<BankEntry>;
}
