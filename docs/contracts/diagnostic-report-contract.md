# Contract — Diagnostic Report

> Domain: diagnostic-report
> Last updated by: diagnostic-report spec

## Commands

### `generate_diagnostic_report` — DGR-020, DGR-021, DGR-022, DGR-023, DGR-024, DGR-025, DGR-026, DGR-027

Writes the diagnostic report to the given path and returns its support code. The path comes from
a native save dialog and is validated as a `.txt` file in an existing folder under the user's
home directory, not inside the app's data or log folder, and not a symbolic link (DGR-023). The report holds no value read from a row of
a table that holds practice data (DGR-022).

- **Args:** `dest_path: String`
- **Returns:** `DiagnosticReportResult`
- **Errors:** `HomeUnresolved` (DGR-026), `PathRejected` (outside the home directory, inside the app's data or log folder, wrong
  extension, a symbolic link, or the folder does not exist — DGR-023), `ReportFailed` (the file
  could not be written — DGR-025)

### `get_startup_failure` — DGR-040, DGR-041, DGR-044, DGR-045

What failed at start-up, or `null` when the start-up succeeded.

- **Args:** none
- **Returns:** `Option<StartupFailure>`
- **Errors:** none — it returns the failure held in memory since the start-up (DGR-040) and reads
  no database or file.

### `generate_startup_failure_report` — DGR-020, DGR-043, DGR-043A, DGR-044A, DGR-023 to DGR-027

Writes the failure report to the given path, validated as `generate_diagnostic_report`'s, and
returns its support code. A start-up that did not fail is refused first (DGR-044A): nothing is
validated or written.

- **Args:** `dest_path: String`
- **Returns:** `DiagnosticReportResult`
- **Errors:** `NoStartupFailure` (the start-up did not fail — DGR-044A), `HomeUnresolved`
  (DGR-026), `PathRejected` (DGR-023), `ReportFailed` (the file could not be written — DGR-025)

---

## Shared Types

```rust
// DGR-020 — the support code of the written report
struct DiagnosticReportResult {
    support_code: String,   // "XXXX-XXXX"
}

// DGR-041 — what failed at start-up
struct StartupFailure {
    stage: StartupStage,
    migration_version: Option<i64>,      // a migration's, when known
    migration_description: Option<String>,
    cause: String,                       // the error's innermost cause only, home as `~`
    backup_taken: bool,                  // DGR-042's backup was saved before the failure
}

// DGR-040, DGR-045 (`Other`) — serialised in snake_case
enum StartupStage {
    PendingImport, Open, Backup, ChecksumRepair, Repair, Migration, Other,
}

// Flat, tagged with `code`; no payload crosses the wire
enum DiagnosticReportError {
    HomeUnresolved,
    PathRejected,
    ReportFailed,
    NoStartupFailure,   // DGR-044A, generate_startup_failure_report only
}
```

## Events

None. No command changes application state; the start-up failure is recorded at start-up,
not by a command (DGR-040).

## Changelog

- 2026-11-22 — #730: `get_startup_failure` and `generate_startup_failure_report`, with `StartupFailure`, `StartupStage` and the error `NoStartupFailure` (DGR-040 to DGR-045).
- 2026-11-14 — #647: the result's comment cites DGR-020 alone (DGR-014, a screen clause, is vacant). No signature, type or error change.
- 2026-10-24 — `generate_diagnostic_report`: a destination inside the app's data or log folder is `PathRejected`; the report is written beside the destination, then moved over it (DGR-027, #512).
