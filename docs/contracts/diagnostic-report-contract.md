# Contract — Diagnostic Report

> Domain: diagnostic-report
> Last updated by: diagnostic-report spec

## Commands

### `generate_diagnostic_report` — DGR-020, DGR-021, DGR-022, DGR-023, DGR-024, DGR-025, DGR-026

Writes the diagnostic report to the given path and returns its support code. The path comes from
a native save dialog and is validated as a `.txt` file in an existing folder under the user's
home directory, and not a symbolic link (DGR-023). The report holds no value read from a row of
a table that holds practice data (DGR-022).

- **Args:** `dest_path: String`
- **Returns:** `DiagnosticReportResult`
- **Errors:** `HomeUnresolved` (DGR-026), `PathRejected` (outside the home directory, wrong
  extension, a symbolic link, or the folder does not exist — DGR-023), `ReportFailed` (the file
  could not be written — DGR-025)

---

## Shared Types

```rust
// DGR-014, DGR-020 — what the screen shows once the report is written
struct DiagnosticReportResult {
    support_code: String,   // "XXXX-XXXX"
}

// Flat, tagged with `code`; no payload crosses the wire
enum DiagnosticReportError {
    HomeUnresolved,
    PathRejected,
    ReportFailed,
}
```

## Events

None. Generating a report changes no application state.
