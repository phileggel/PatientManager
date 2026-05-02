# Contract — Database Backup

> Domain: db-backup
> Last updated by: db-backup spec

## Commands

### `export_database` — R7, R8, R11

Exports the active SQLite database to the given path as a gzip-compressed file (`.db.gz`). Uses an online backup API to produce a clean copy without interrupting active connections. Any temporary files are cleaned up on completion or failure.

- **Args:** `dest_path: String`
- **Returns:** `()`
- **Errors:** `ExportFailed`

---

### `import_database` — R9, R10, R11

Decompresses, validates, and stages a backup file as a pending replacement. The actual replacement happens on the next application startup — the active database is not touched until then. Any temporary files are cleaned up on completion or failure.

- **Args:** `source_path: String`
- **Returns:** `()`
- **Errors:** `DecompressionFailed`, `ValidationFailed`, `StagingFailed`

---

## Shared Types

None — both commands operate on file paths only.

## Events

None — no domain events are emitted by this feature.

## Changelog

- 2026-05-02 — Added by `db-backup` spec: export_database, import_database
