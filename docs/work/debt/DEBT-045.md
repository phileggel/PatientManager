# 2026-10-06 — DEBT-045 — The procedure type spec and its code have drifted apart

**Found by:** spec-checker, release preparation of 0.24.1 (read in the code, not run)

**Where:** `docs/spec/procedure-type.md`, `src-tauri/src/context/procedure/repository/procedure_type.rs` (`find_by_name`), `src/features/procedure-type/`

**Observation:** 19 of 23 rules are fully implemented. One behaviour gap: R4's name uniqueness compares with SQLite's `LOWER()`, which folds ASCII only, so "Échographie" and "échographie" are both accepted (not run; every test of R4 uses a mock that lowercases in Rust) — compare in Rust, as the patient duplicates do. Spec text to realign with `/spec-writer`: R8 still says the screen blocks an empty name (since 0.24.1 the aggregate refuses it and the edit form shows the message; the creation form disables its button); R4 says the duplicate error is inline while R16 and R17 say a toast, which is what happens; R7 and R9 give a literal currency format and an en dash the screen does not use; the entry point is the management card, not the side rail. No test: R5 (the event), R6 and R21 (the repository has no test module), the delete confirmation and its two toasts (R19, R20), the creation form's disabled button, the manager hook's count.
