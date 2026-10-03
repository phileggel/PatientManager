//! The transaction a unit of work writes on (ADR-003).
//!
//! Shared and domain-blind: it only opens a transaction. What is written on it
//! is a use case's unit of work (`use_cases/{flow}/`), implemented beside the
//! use case over the repositories' own row writers.

use std::future::Future;
use std::pin::Pin;

use anyhow::Context;
use sqlx::{Sqlite, SqlitePool, Transaction};

/// What a unit of work operation returns: its writes, awaited on the transaction.
pub type UnitOfWorkFuture<'a> = Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + 'a>>;

pub struct SqlxTransactionManager {
    pool: SqlitePool,
}

impl SqlxTransactionManager {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Open a transaction. Committed explicitly; dropped without a commit, it
    /// rolls back.
    pub async fn begin(&self) -> anyhow::Result<Transaction<'static, Sqlite>> {
        self.pool
            .begin()
            .await
            .context("Failed to open a transaction")
    }
}
