# Tech Debt

Observations of code smells, inconsistencies, and brittle patterns. Not commitments — tech-debt entries describe _what's odd_, not _what to do_. For action items see `docs/todo.md`.

`whats-next` reads from this file; entries surface as work candidates labelled with their date.

---

<!-- entries removed when resolved; this file is otherwise the running observation log -->

## 2026-05-11 — SQLite `LOWER()` is ASCII-only in `find_patient_by_name`

**Where:** `src-tauri/src/context/patient/repository.rs` — `find_patient_by_name` SQL uses `WHERE LOWER(name) = LOWER($1)`.

**Observation:** SQLite's built-in `LOWER()` only folds ASCII characters, while Rust's `str::to_lowercase()` is Unicode-aware. If a DB row stores `"élodie dupont"` (e.g. via a manual edit) and an Excel row carries `"Élodie Dupont"`, the lookup misses and a duplicate is created — defeating the EXI-080 dedup the function is meant to enforce. The re-import scenario (same workbook → identical casing) works fine because both sides land in the symmetric ASCII-fold path, but the protection breaks once the DB and Excel casings drift on accented characters.

**Branch:** `fix/excel-import-dedup-empty-ssn` · commit pending

---

## 2026-05-12 — `pdf_extractor` is a cross-use-case import

**Where:** `src-tauri/src/use_cases/bank_statement_reconciliation/orchestrator.rs` and `…/api.rs` both import `crate::use_cases::fund_payment_reconciliation::parsing::pdf_extractor`.

**Observation:** `pdf_extractor` is a pure PDF→text utility with no fund-payment-specific knowledge, yet it sits inside the `fund_payment_reconciliation` use case. Per B18 (use cases MUST NOT import from another use case), this is a violation. The natural fix is to move the module to `shared/infrastructure/` (or equivalent kit-v4.4 shared bucket) so both `bank_statement_reconciliation` and `fund_payment_reconciliation` consume it without crossing use-case boundaries. Pre-existing — the import already existed in `bank_statement_reconciliation/api.rs` before today's api-boundary cleanup.

---

## 2026-05-12 — `previous_payment_status` parse silently falls back to `None`

**Where:** `src-tauri/src/context/procedure/repository/procedure_refund.rs:82, 125` — `r.previous_payment_status.parse::<ProcedureStatus>().unwrap_or_default()`.

**Observation:** The `procedure_refund.previous_payment_status` column is `NOT NULL`. Any value that fails to parse (e.g. a future variant rename, a manual DB edit, a schema drift) silently degrades to `ProcedureStatus::None` instead of surfacing as an error at the boundary. Pre-existing behaviour — the prior hand-rolled `parse_procedure_status` also had `_ => ProcedureStatus::None`. A hardening pass could swap to `.with_context(|| ...)?` and propagate, which would catch data corruption visibly instead of materialising a `None`-status `ProcedureRefund` to the caller.
