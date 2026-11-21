//! BSM-038A to BSM-038E (#732) — the repair start-up runs on the bank context's
//! links before migration 20261114 gives a fund payment group one bank entry at
//! most (BSM-038): without it that migration stops on a group already linked
//! to several.

use std::future::Future;
use std::pin::Pin;

use anyhow::Result;
use sqlx::SqlitePool;

use crate::BACKEND;

/// The migration that gives a fund payment group one bank entry at most.
const ONE_BANK_ENTRY_PER_GROUP_VERSION: i64 = 20261114;

/// Every group linked more than once.
const LINKED_TWICE: &str = "SELECT fund_payment_group_id FROM bank_transfer_fund_group_link
                            GROUP BY fund_payment_group_id HAVING COUNT(*) > 1";

/// The step `Database::new_with_steps` runs before the migrations.
pub fn unlink_group_double_links(
    pool: &SqlitePool,
) -> Pin<Box<dyn Future<Output = Result<()>> + Send + '_>> {
    Box::pin(unlink_if_pending(pool))
}

/// Runs the repair on a database that holds the link table and has not taken
/// migration 20261114: once its unique index exists, no double link can.
async fn unlink_if_pending(pool: &SqlitePool) -> Result<()> {
    let link_table: Option<String> = sqlx::query_scalar(
        "SELECT name FROM sqlite_master
         WHERE type = 'table' AND name = 'bank_transfer_fund_group_link'",
    )
    .fetch_optional(pool)
    .await?;
    if link_table.is_none() {
        return Ok(());
    }
    let applied: Option<i64> = sqlx::query_scalar(
        "SELECT version FROM _sqlx_migrations WHERE version = ? AND success = 1",
    )
    .bind(ONE_BANK_ENTRY_PER_GROUP_VERSION)
    .fetch_optional(pool)
    .await?;
    if applied.is_some() {
        return Ok(());
    }
    unlink(pool).await
}

/// Leaves every fund payment group with one link, in one transaction, and
/// deletes no bank entry (owner, 2026-11-21, #732):
/// - BSM-038B — a link to a bank entry that no longer exists is removed;
/// - BSM-038C — of the existing entries, the most recent goes on settling the
///   group: the latest date, then the link recorded last;
/// - BSM-038D — every other entry only loses its link to the group;
/// - BSM-038E — the group and its procedures are not touched.
async fn unlink(pool: &SqlitePool) -> Result<()> {
    let mut tx = pool.begin().await?;

    let missing = sqlx::query(sqlx::AssertSqlSafe(format!(
        "DELETE FROM bank_transfer_fund_group_link
         WHERE bank_transfer_id NOT IN (SELECT id FROM bank_transfer)
           AND fund_payment_group_id IN ({LINKED_TWICE})"
    )))
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if missing > 0 {
        tracing::warn!(
            target: BACKEND,
            links = missing,
            "Removed links from a fund payment group to a bank entry that no longer exists"
        );
    }

    // The entry that goes on settling each group comes first.
    let links: Vec<(String, String, String)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT l.id, l.bank_transfer_id, l.fund_payment_group_id
         FROM bank_transfer_fund_group_link l
         JOIN bank_transfer bt ON bt.id = l.bank_transfer_id
         WHERE l.fund_payment_group_id IN ({LINKED_TWICE})
         ORDER BY l.fund_payment_group_id, bt.transfer_date DESC, l.rowid DESC"
    )))
    .fetch_all(&mut *tx)
    .await?;

    let mut kept: Option<(String, String)> = None; // (group, entry)
    for (link_id, entry_id, group_id) in links {
        let keeper = match &kept {
            Some((group, entry)) if *group == group_id => entry.clone(),
            _ => {
                kept = Some((group_id, entry_id));
                continue;
            }
        };
        sqlx::query("DELETE FROM bank_transfer_fund_group_link WHERE id = ?")
            .bind(&link_id)
            .execute(&mut *tx)
            .await?;
        tracing::warn!(
            target: BACKEND,
            fund_payment_group_id = %group_id,
            kept_bank_entry_id = %keeper,
            unlinked_bank_entry_id = %entry_id,
            "Fund payment group linked to several bank entries: the most recent goes on settling it, the other is unlinked and kept"
        );
    }

    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// A database upgraded up to, not including, migration 20261114, foreign
    /// keys off while seeding: an old database's links may reference a bank
    /// entry that no longer exists.
    async fn pool_before_the_migration() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE _sqlx_migrations (
                version INTEGER PRIMARY KEY,
                description TEXT NOT NULL,
                installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN NOT NULL,
                checksum BLOB NOT NULL,
                execution_time BIGINT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        for m in sqlx::migrate!("./migrations")
            .iter()
            .filter(|m| m.version < ONE_BANK_ENTRY_PER_GROUP_VERSION)
        {
            sqlx::raw_sql(m.sql.clone()).execute(&pool).await.unwrap();
        }
        pool
    }

    /// The repair as start-up runs it: on the pool, foreign keys enforced.
    async fn repair(pool: &SqlitePool) {
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(pool)
            .await
            .unwrap();
        unlink_group_double_links(pool).await.unwrap();
    }

    async fn run_the_migration(pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let migrator = sqlx::migrate!("./migrations");
        let m = migrator
            .iter()
            .find(|m| m.version == ONE_BANK_ENTRY_PER_GROUP_VERSION)
            .unwrap();
        sqlx::raw_sql(m.sql.clone()).execute(pool).await.map(|_| ())
    }

    async fn seed_entry(pool: &SqlitePool, id: &str, date: &str, amount: i64) {
        sqlx::query(
            "INSERT INTO bank_transfer (id, transfer_date, amount, transfer_type, bank_account_id)
             VALUES (?, ?, ?, 'FUND', 'account-1')",
        )
        .bind(id)
        .bind(date)
        .bind(amount)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn seed_group(pool: &SqlitePool, id: &str, total: i64) {
        sqlx::query(
            "INSERT INTO fund_payment_group (id, fund_id, payment_date, total_amount, status)
             VALUES (?, 'fund-1', '2026-01-01', ?, 'BANK_PAYED')",
        )
        .bind(id)
        .bind(total)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn seed_link(pool: &SqlitePool, id: &str, entry: &str, group: &str) {
        sqlx::query(
            "INSERT INTO bank_transfer_fund_group_link (id, bank_transfer_id, fund_payment_group_id)
             VALUES (?, ?, ?)",
        )
        .bind(id)
        .bind(entry)
        .bind(group)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn entries_of(pool: &SqlitePool, group: &str) -> Vec<String> {
        sqlx::query_scalar(
            "SELECT bank_transfer_id FROM bank_transfer_fund_group_link
             WHERE fund_payment_group_id = ? ORDER BY bank_transfer_id",
        )
        .bind(group)
        .fetch_all(pool)
        .await
        .unwrap()
    }

    async fn amount_of(pool: &SqlitePool, entry: &str) -> Option<i64> {
        sqlx::query_scalar("SELECT amount FROM bank_transfer WHERE id = ?")
            .bind(entry)
            .fetch_optional(pool)
            .await
            .unwrap()
    }

    /// #732's case: two existing entries, six days apart, each the group's total.
    #[tokio::test]
    async fn test_732_bsm_038c_038d_the_most_recent_entry_settles_the_group_the_other_is_kept_unlinked(
    ) {
        let pool = pool_before_the_migration().await;
        seed_group(&pool, "group-1", 10_000).await;
        seed_entry(&pool, "entry-old", "2026-02-03", 10_000).await;
        seed_entry(&pool, "entry-new", "2026-02-09", 10_000).await;
        seed_link(&pool, "link-1", "entry-new", "group-1").await;
        seed_link(&pool, "link-2", "entry-old", "group-1").await;
        assert!(
            run_the_migration(&pool).await.is_err(),
            "without the repair the upgrade stops"
        );

        repair(&pool).await;

        assert_eq!(entries_of(&pool, "group-1").await, vec!["entry-new"]);
        assert_eq!(
            amount_of(&pool, "entry-old").await,
            Some(10_000),
            "the other entry is kept, its amount unchanged"
        );
        assert_eq!(amount_of(&pool, "entry-new").await, Some(10_000));
        // BSM-038E — the group is as it was.
        let group: (String, i64, String) = sqlx::query_as(
            "SELECT payment_date, total_amount, status FROM fund_payment_group WHERE id = 'group-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            group,
            ("2026-01-01".to_string(), 10_000, "BANK_PAYED".to_string())
        );
        run_the_migration(&pool)
            .await
            .expect("the upgrade runs after the repair");
    }

    #[tokio::test]
    async fn test_732_bsm_038c_on_one_date_the_link_recorded_last_settles_the_group() {
        let pool = pool_before_the_migration().await;
        seed_entry(&pool, "entry-a", "2026-02-01", 10_000).await;
        seed_entry(&pool, "entry-b", "2026-02-01", 10_000).await;
        seed_link(&pool, "link-1", "entry-b", "group-1").await;
        seed_link(&pool, "link-2", "entry-a", "group-1").await;

        repair(&pool).await;

        assert_eq!(entries_of(&pool, "group-1").await, vec!["entry-a"]);
        assert_eq!(amount_of(&pool, "entry-b").await, Some(10_000));
    }

    #[tokio::test]
    async fn test_732_bsm_038d_an_unlinked_entry_keeps_its_other_groups() {
        let pool = pool_before_the_migration().await;
        seed_entry(&pool, "entry-old", "2026-02-01", 14_000).await;
        seed_entry(&pool, "entry-new", "2026-02-09", 10_000).await;
        seed_link(&pool, "link-1", "entry-old", "group-1").await;
        seed_link(&pool, "link-2", "entry-old", "group-2").await;
        seed_link(&pool, "link-3", "entry-new", "group-1").await;

        repair(&pool).await;

        assert_eq!(entries_of(&pool, "group-1").await, vec!["entry-new"]);
        assert_eq!(entries_of(&pool, "group-2").await, vec!["entry-old"]);
        assert_eq!(amount_of(&pool, "entry-old").await, Some(14_000));
    }

    #[tokio::test]
    async fn test_732_bsm_038b_a_link_to_a_missing_entry_is_removed() {
        let pool = pool_before_the_migration().await;
        seed_entry(&pool, "entry-live", "2026-02-01", 10_000).await;
        seed_link(&pool, "link-1", "entry-gone", "group-1").await;
        seed_link(&pool, "link-2", "entry-live", "group-1").await;
        // A group linked once is left alone, its entry missing or not.
        seed_link(&pool, "link-3", "entry-gone-too", "group-2").await;

        repair(&pool).await;

        assert_eq!(entries_of(&pool, "group-1").await, vec!["entry-live"]);
        assert_eq!(entries_of(&pool, "group-2").await, vec!["entry-gone-too"]);
        run_the_migration(&pool)
            .await
            .expect("the upgrade runs after the repair");
    }

    #[tokio::test]
    async fn test_732_bsm_038a_the_repair_runs_only_until_the_migration_is_applied() {
        // No link table yet: nothing to do.
        let empty = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        unlink_group_double_links(&empty).await.unwrap();

        let pool = pool_before_the_migration().await;
        seed_entry(&pool, "entry-a", "2026-02-01", 10_000).await;
        seed_entry(&pool, "entry-b", "2026-02-09", 10_000).await;
        seed_link(&pool, "link-1", "entry-a", "group-1").await;
        seed_link(&pool, "link-2", "entry-b", "group-1").await;
        sqlx::query(
            "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time)
             VALUES (?, 'applied', 1, x'00', 0)",
        )
        .bind(ONE_BANK_ENTRY_PER_GROUP_VERSION)
        .execute(&pool)
        .await
        .unwrap();

        repair(&pool).await;

        assert_eq!(entries_of(&pool, "group-1").await.len(), 2);
    }
}
