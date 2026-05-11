# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns. Not commitments — tech-debt entries describe _what's odd_, not _what to do_. For action items see `docs/todo.md`.

`whats-next` reads from this file; entries surface as work candidates labelled with their date.

---

<!-- entries removed when resolved; this file is otherwise the running observation log -->

## 2026-05-11 — IBAN value logged at trace level in `bank_account` repository

**Where:** `src-tauri/src/context/bank/repository/bank_account.rs:95` and `:115` — `tracing::trace!(iban = %iban, ...)` in account lookup paths.

**Observation:** IBAN is personal financial data. Trace level is typically filtered out of production builds via `EnvFilter`, so the realistic exposure is limited — but if trace is ever enabled to debug bank-statement matching, the full IBAN lands in `app.log`. A future sweep should mirror the SSN/patient-name PII removal applied on 2026-05-11: drop the value field and keep only the message, or log a hash / last-4-digits if correlation in logs is genuinely useful. Same shape applies to any other IBAN-bearing `tracing!` calls in the bank context.

---

## 2026-05-11 — SQLite `LOWER()` is ASCII-only in `find_patient_by_name`

**Where:** `src-tauri/src/context/patient/repository.rs` — `find_patient_by_name` SQL uses `WHERE LOWER(name) = LOWER($1)`.

**Observation:** SQLite's built-in `LOWER()` only folds ASCII characters, while Rust's `str::to_lowercase()` is Unicode-aware. If a DB row stores `"élodie dupont"` (e.g. via a manual edit) and an Excel row carries `"Élodie Dupont"`, the lookup misses and a duplicate is created — defeating the EXI-080 dedup the function is meant to enforce. The re-import scenario (same workbook → identical casing) works fine because both sides land in the symmetric ASCII-fold path, but the protection breaks once the DB and Excel casings drift on accented characters.

**Branch:** `fix/excel-import-dedup-empty-ssn` · commit pending
