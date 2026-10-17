# 2026-10-06 — DEBT-045 — The procedure type spec and its code have drifted apart

**Found by:** spec-checker, release preparation of 0.24.1 (read in the code, not run)

**Where:** `docs/spec/procedure-type.md`, `src-tauri/src/context/procedure/repository/procedure_type.rs` (`find_by_name`), `src/features/procedure-type/`

**Observation:** 19 of 23 rules are fully implemented. Spec text to realign with `/spec-writer`: R8 still says the screen blocks an empty name (since 0.24.1 the aggregate refuses it and the edit form shows the message; the creation form disables its button); R4 says the duplicate error is inline while R16 and R17 say a toast, which is what happens; R7 and R9 give a literal currency format and an en dash the screen does not use; the entry point is the management card, not the side rail. No test: R5 (the event), R6 and R21 (the repository has no test module), the delete confirmation and its two toasts (R19, R20), the creation form's disabled button, the manager hook's count.

**Size:** M

**Waits on the owner:** no

**Refined (2026-10-14, before queuing):** this batch takes R4 only; the spec realignment and the missing tests stay open. Confirmed: `find_by_name` compares with `LOWER(name) = LOWER($1)` (`procedure_type.rs:145`), which folds ASCII only. Done when: a name that differs from an existing one only by case, accented letters included ("Échographie" / "échographie"), is refused as a duplicate, compared in Rust as the patient duplicates are; a repository test against a real database proves it, not a mock. A `fix`. Size S for the slice.

**Shipped 2026-10-14:** the R4 slice — names now compare case-insensitively in Rust, accented letters included, with repository tests on a real database. What is above stays open.

**Added 2026-10-17** (`spec-checker`, release preparation): 23 of 23 rules implemented, 17 fully as written. Spec against code, the owner's: R4 (inline) against R16/R17 (snackbar) for a duplicate; R7's literal `€…toFixed(2)` against the locale format; R9's en dash against a hyphen; R8, a whitespace-only name refused by the backend round trip rather than before submit. Tests owed: R5 (the event on add, update, delete), R19/R20 (confirm → delete → snackbars), R21 (the `Import` rename, "import" refused), R22/R6 on a real database (the reserved type read, a deleted one not), R17 (button and double-click open the modal), R9's missing-category cell; `ProcedureTypeList.test.tsx:266` proves nothing (its rows are filtered by the mock).
