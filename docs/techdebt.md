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

---

## 2026-05-13 — Reconciliation matcher does not filter already-reconciled procedures

**Where:** `src-tauri/src/context/procedure/repository/procedure.rs:403–449` — `find_procedures_by_ssns_and_date_range_with_ssn`. The `WHERE` clause filters on SSN, date range, and `is_deleted = 0` only; `payment_status` is not constrained.

**Observation:** The 8-pass matcher fed by this query treats `Reconciled` / `PartiallyReconciled` procedures as live candidates against newly parsed PDF lines. When the same PDF is re-opened, every line still matches its previously-reconciled procedure; differences between the PDF's amount/fund/date and the stored values surface as `AmountMismatch` / `FundMismatch` / `DateMismatch` anomalies, sending the user into an auto-correction review that the duplicate-PDF guard will reject at validate time anyway (see the next entry). Tightening the SQL to `AND hp.payment_status = 'CREATED'` (or excluding `Reconciled` / `PartiallyReconciled` explicitly) would short-circuit the noise. Surfaced during manual testing of fund-payment reconciliation; reproduces by importing the same fund PDF twice.

---

## 2026-05-13 — Duplicate-PDF guard fires only at validation, not at reconciliation

**Where:** `src-tauri/src/use_cases/fund_payment_reconciliation/orchestrator.rs:91–110` (`is_duplicate_candidate`) is only invoked inside `create_multiple_from_candidates` and `create_multiple_with_auto_corrections` (the Validate / Auto-correct-all paths), never inside `reconcile_and_create_candidates`.

**Observation:** A PDF that has already been imported makes it all the way through anomaly review and the auto-correction UI before the backend rejects it with *"All N payment groups already exist. PDF was likely already processed."* The user can't tell, at modal-open time, that the work they're about to do will be discarded — the FE surfaces no upstream signal. The lift is mechanical: run the same `is_duplicate_candidate` pass at the end of `reconcile_and_create_candidates_fn` and either short-circuit with a typed `DuplicatePdf` response or flag every candidate so the FE renders an empty-state up front. Pairs with the entry below; together they explain the "couldn't go further → reopened → nothing processable" pattern seen during manual testing.

---

## 2026-05-13 — Auto-corrections persist even when duplicate-PDF check rejects the batch

**Where:** `src-tauri/src/use_cases/fund_payment_reconciliation/orchestrator.rs:345–392` — `create_multiple_with_auto_corrections` runs `apply_auto_corrections` (Step 1) before `is_duplicate_candidate` (Step 3). `apply_auto_corrections` invokes `apply_update_corrections`, `apply_create_corrections`, and `apply_link_corrections`, each of which commits its DB writes independently.

**Observation:** When Step 3 bails (re-imported PDF), the procedure-row mutations from Step 1 are already committed — amount/fund/date edits, status flips (`ContestAmount` → `Reconciled`), and even freshly-created patients from `CreateProcedure` corrections persist with no matching `FundPaymentGroup` to justify them. Symptoms observed: reopening the same PDF after the failed run shows "nothing processable" because the matcher now finds clean state on the procedures it previously flagged. This is a silent partial-mutation on a failed validation — exactly the class of issue that quietly corrupts production data. Fixes range from wrapping Steps 1–4 in a single transaction (preferred) to hoisting the duplicate check above `apply_auto_corrections` so nothing writes until validation passes. Surfaced during the same manual testing run that uncovered the previous two entries.

---

## 2026-05-13 — Dead trait method `ProcedureRepository::find_procedures_by_ssns_and_date_range`

**Where:** trait at `src-tauri/src/context/procedure/domain/procedure.rs:446`, impl at `src-tauri/src/context/procedure/repository/procedure.rs:346`, plus the inline tests around `procedure.rs:1269,1279` and four defensive mock stubs in `use_cases/{overpayment,bank_statement_reconciliation,procedure_orchestration}` test modules and `use_cases/fund_payment_reconciliation/data/pool_builder.rs`.

**Observation:** The non-`_with_ssn` variant has no production callers — the matcher uses `find_procedures_by_ssns_and_date_range_with_ssn`, and every mention outside the impl is either the impl's own inline test or a `mock.expect_*().returning(...)` defensive stub copy-pasted from the trait surface. Removal is mechanical (trait + impl + 2 tests + 4 mock stubs, ~100 LOC across 6 files). Deferred from the bug-fix PR because the file fanout breaks the boyscout surgical rule.
