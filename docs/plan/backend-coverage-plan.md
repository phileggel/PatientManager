# Backend Coverage Improvement Plan

**Baseline:** 44.96% (2256/5018 lines) — 2026-05-02

---

## What to skip

All `api.rs` files (Tauri command handlers) are 0% across every bounded context and use case.
They require a live `AppState` / Tauri context and are better covered by E2E tests.
Also skip `main.rs`, `specta_builder.rs`, `generate_bindings.rs` — infrastructure bootstrapping.

---

## Tier 1 — Pure logic, no DB, no mocks ✅ DONE

Target: ~48% (+185 lines)

| File                                            | Before | Target | Approach                                                                                                                                              |
| ----------------------------------------------- | ------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fund_payment_reconciliation/core/processor.rs` | 13%    | 85%    | Combinatorial pure fns: `find_exact_combination`, `find_best_combination`, `find_single_exact_match`, `find_single_closest_match`, `next_combination` |
| `excel_import/domain.rs`                        | 0%     | 80%    | Pure date fns: `parse_text_date_to_iso`, `convert_excel_date_to_iso`                                                                                  |
| `excel_import/parser.rs`                        | 2%     | 20%    | Private helpers: `ColIdx::from_header_row`, `ExcelParserService::is_excel_error`                                                                      |
| `overpayment/orchestrator.rs` (helper only)     | 0%     | ~5%    | `parse_transfer_type` pure string→enum fn                                                                                                             |

---

## Tier 2 — Services with mock repositories

Target: ~55% (+341 lines)

| File                                            | Before | Target | Approach                                                                                                |
| ----------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------- |
| `procedure_orchestration/service.rs`            | 52%    | 85%    | Mock traits already defined — add test cases for `create_batch`, `update_procedure`, status transitions |
| `overpayment/orchestrator.rs`                   | 0%     | 65%    | `create_overpayment`, `cancel_overpayment` — mock 4 repository dependencies                             |
| `excel_import/orchestrator.rs`                  | 0%     | 60%    | Happy path + duplicate-patient branch                                                                   |
| `patient/service.rs`                            | 26%    | 75%    | Low-hanging: 46 coverable lines, mocks already present                                                  |
| `bank_statement_reconciliation/orchestrator.rs` | 19%    | 65%    | 144-line orchestrator; borrow patterns from `bank_statement_reconciliation/parser.rs` (92%)             |

---

## Tier 3 — Repository layer with real SQLite (sqlx::test)

Target: ~59% (+181 lines)

| File                                       | Before | Target | Approach                                                                                    |
| ------------------------------------------ | ------ | ------ | ------------------------------------------------------------------------------------------- |
| `procedure/repository/procedure_refund.rs` | 0%     | 70%    | All CRUD via `sqlx::test` with in-memory pool; follow `patient/repository.rs` (99%) pattern |
| `procedure/repository/procedure.rs`        | 49%    | 80%    | `validate_batch` + `create_batch` are the main gaps                                         |
| `fund/repository.rs`                       | 58%    | 82%    | Extend existing tests                                                                       |

---

## Reference: pattern for mock-based service tests

See `docs/testing.md` §Backend and `context/procedure/service.rs` for the canonical
mock-repository pattern used in this codebase.
