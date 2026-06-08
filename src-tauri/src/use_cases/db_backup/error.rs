use serde::Serialize;
use specta::Type;
use thiserror::Error;

/// Typed error for the database-backup use case.
///
/// `db_backup` orchestrates no bounded context — it is pure infrastructure
/// (filesystem + SQLite snapshotting) — so this is a single flat enum rather
/// than a `{UseCase}Error` composite. Tagged with `code` so each variant emits
/// `{ "code": "..." }` on the wire.
///
/// Variants carry no payload: the underlying `std::io` / `sqlx` detail is logged
/// at the failure site via `tracing::error!` and never crosses the wire (it can
/// leak absolute paths). The frontend maps each code to a localized message.
#[derive(Debug, Clone, Error, Serialize, Type)]
#[serde(tag = "code")]
pub enum DbBackupError {
    /// The user's home directory could not be resolved — the allowed-root for
    /// path validation is unavailable.
    #[error("Cannot resolve the user home directory")]
    HomeUnresolved,

    /// The frontend-supplied path was rejected by the secure-path validator
    /// (outside the allowed root, wrong extension, or wrong file kind).
    #[error("The selected path was rejected")]
    PathRejected,

    /// Producing the compressed snapshot failed (VACUUM, gzip, or file I/O).
    #[error("Failed to export the database")]
    ExportFailed,

    /// Staging the backup failed (decompression, file I/O, or rename).
    #[error("Failed to import the database")]
    ImportFailed,

    /// The decompressed file is not a valid, intact SQLite database — the
    /// integrity check failed. The selected file is not a usable backup.
    #[error("The backup file is corrupt or not a valid database")]
    BackupCorrupted,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, to_value};

    #[test]
    fn each_variant_emits_a_code() {
        for (err, code) in [
            (DbBackupError::HomeUnresolved, "HomeUnresolved"),
            (DbBackupError::PathRejected, "PathRejected"),
            (DbBackupError::ExportFailed, "ExportFailed"),
            (DbBackupError::ImportFailed, "ImportFailed"),
            (DbBackupError::BackupCorrupted, "BackupCorrupted"),
        ] {
            assert_eq!(to_value(&err).unwrap(), json!({ "code": code }));
        }
    }
}
