//! The database's technical state, for the diagnostic report (DGR-021, DGR-022):
//! names and counts, never a value stored in a row.
//!
//! Every query here is a runtime query, not a `sqlx` macro: it reads SQLite's
//! own catalogue and pragmas, and counts rows of tables whose names are only
//! known at run time (the exception rule B27 names).

use std::collections::BTreeMap;

use sqlx::{AssertSqlSafe, SqlitePool};

/// What a use case may ask about the database itself. Each answer is a list of
/// text lines; an `Err` is a section the caller reports as unavailable.
#[async_trait::async_trait]
pub trait DatabaseDiagnostics: Send + Sync {
    /// The migration history: version, description, outcome.
    async fn migrations(&self) -> anyhow::Result<Vec<String>>;
    /// SQLite's integrity check, as it reports it.
    async fn integrity_check(&self) -> anyhow::Result<Vec<String>>;
    /// Foreign-key violations per table: the table names and how many, never the rows.
    async fn foreign_key_check(&self) -> anyhow::Result<Vec<String>>;
    /// The number of rows of each table.
    async fn row_counts(&self) -> anyhow::Result<Vec<String>>;
}

pub struct SqliteDatabaseDiagnostics {
    pool: SqlitePool,
}

impl SqliteDatabaseDiagnostics {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl DatabaseDiagnostics for SqliteDatabaseDiagnostics {
    async fn migrations(&self) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(i64, String, bool)> = sqlx::query_as(
            "SELECT version, description, success FROM _sqlx_migrations ORDER BY version",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|(version, description, success)| {
                format!(
                    "{version} {description} {}",
                    if success { "ok" } else { "FAILED" }
                )
            })
            .collect())
    }

    async fn integrity_check(&self) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String,)> = sqlx::query_as("PRAGMA integrity_check")
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(|(line,)| line).collect())
    }

    async fn foreign_key_check(&self) -> anyhow::Result<Vec<String>> {
        let rows: Vec<(String, Option<i64>, String, i64)> =
            sqlx::query_as("PRAGMA foreign_key_check")
                .fetch_all(&self.pool)
                .await?;
        let mut per_table: BTreeMap<String, usize> = BTreeMap::new();
        for (table, _rowid, _parent, _fk) in rows {
            *per_table.entry(table).or_default() += 1;
        }
        if per_table.is_empty() {
            return Ok(vec!["0 violations".to_string()]);
        }
        Ok(per_table
            .into_iter()
            .map(|(table, count)| format!("{table}: {count} violation(s)"))
            .collect())
    }

    async fn row_counts(&self) -> anyhow::Result<Vec<String>> {
        let tables: Vec<(String,)> = sqlx::query_as(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await?;
        let mut lines = Vec::with_capacity(tables.len());
        for (table,) in tables {
            // The name comes from SQLite's own catalogue; quoted as an identifier.
            let quoted = table.replace('"', "\"\"");
            let (count,): (i64,) =
                sqlx::query_as(AssertSqlSafe(format!(r#"SELECT COUNT(*) FROM "{quoted}""#)))
                    .fetch_one(&self.pool)
                    .await?;
            lines.push(format!("{table}: {count}"));
        }
        Ok(lines)
    }
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;

    // Values a leak would carry: chosen so they cannot appear by accident
    // (not a table name, a migration description or a version).
    const PATIENT_NAME: &str = "Zzyxa Qwortuipe";
    const PATIENT_SSN: &str = "2990199123456";
    const FUND_NAME: &str = "Caisse Vraiment Unique";

    async fn seeded() -> SqliteDatabaseDiagnostics {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory database");
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .expect("migrations");
        sqlx::query("INSERT INTO patient (id, name, ssn, is_anonymous, is_deleted) VALUES ('p1', ?, ?, 0, 0)")
            .bind(PATIENT_NAME)
            .bind(PATIENT_SSN)
            .execute(&pool)
            .await
            .expect("seed patient");
        sqlx::query(
            "INSERT INTO fund (id, fund_identifier, name, is_deleted) VALUES ('f1', 'F1', ?, 0)",
        )
        .bind(FUND_NAME)
        .execute(&pool)
        .await
        .expect("seed fund");
        SqliteDatabaseDiagnostics::new(pool)
    }

    async fn every_line(database: &SqliteDatabaseDiagnostics) -> Vec<String> {
        let mut lines = database.migrations().await.expect("migrations");
        lines.extend(database.integrity_check().await.expect("integrity"));
        lines.extend(database.foreign_key_check().await.expect("foreign keys"));
        lines.extend(database.row_counts().await.expect("row counts"));
        lines
    }

    #[tokio::test]
    async fn test_dgr_022_no_line_holds_a_value_read_from_a_row() {
        let lines = every_line(&seeded().await).await.join("\n");

        for leaked in [PATIENT_NAME, PATIENT_SSN, FUND_NAME] {
            assert!(!lines.contains(leaked), "must not contain {leaked}");
        }
    }

    #[tokio::test]
    async fn test_dgr_021_migrations_checks_and_counts_are_read() {
        let database = seeded().await;

        let migrations = database.migrations().await.expect("migrations");
        assert!(migrations.iter().all(|line| line.ends_with(" ok")));
        assert!(!migrations.is_empty());
        assert_eq!(
            database.integrity_check().await.expect("integrity"),
            vec!["ok"]
        );
        assert_eq!(
            database.foreign_key_check().await.expect("foreign keys"),
            vec!["0 violations"]
        );
        let counts = database.row_counts().await.expect("row counts");
        assert!(counts.contains(&"patient: 1".to_string()));
        assert!(counts.contains(&"fund: 1".to_string()));
    }

    #[tokio::test]
    async fn test_dgr_025_a_part_that_cannot_be_read_is_an_error_and_the_others_still_answer() {
        let database = seeded().await;
        sqlx::query("DROP TABLE _sqlx_migrations")
            .execute(&database.pool)
            .await
            .expect("drop table");

        assert!(database.migrations().await.is_err());
        assert!(database.row_counts().await.is_ok());
    }
}
