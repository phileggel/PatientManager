/// Repository for junction tables linking bank transfers to fund groups and procedures.
/// Operates on IDs only — no cross-context domain objects.
#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub trait BankEntryLinkRepository: Send + Sync {
    /// Link a bank transfer to one or more fund payment groups
    async fn link_fund_groups(
        &self,
        bank_transfer_id: &str,
        group_ids: &[String],
    ) -> anyhow::Result<()>;

    /// Get fund payment group IDs linked to a bank transfer
    async fn get_fund_group_ids(&self, bank_transfer_id: &str) -> anyhow::Result<Vec<String>>;

    /// Remove all fund group links for a bank transfer
    async fn unlink_all_fund_groups(&self, bank_transfer_id: &str) -> anyhow::Result<()>;

    /// Get the bank transfer ID linked to a fund payment group (if any)
    async fn get_transfer_for_fund_group(
        &self,
        fund_payment_group_id: &str,
    ) -> anyhow::Result<Option<String>>;

    /// Link a bank transfer to one or more procedures
    async fn link_procedures(
        &self,
        bank_transfer_id: &str,
        procedure_ids: &[String],
    ) -> anyhow::Result<()>;

    /// Get procedure IDs linked to a bank transfer
    async fn get_procedure_ids(&self, bank_transfer_id: &str) -> anyhow::Result<Vec<String>>;

    /// Remove all procedure links for a bank transfer
    async fn unlink_all_procedures(&self, bank_transfer_id: &str) -> anyhow::Result<()>;
}
