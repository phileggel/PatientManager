# 2026-10-05 — DEBT-033 — Two read models write the definition of an open procedure twice

**Found by:** manual (TODO-004 review)

**Where:** `src-tauri/src/context/procedure/repository/procedure.rs` (`find_unreconciled_by_date_range` and the query behind `OpenProcedureCandidate`), `src-tauri/src/context/procedure/domain/procedure.rs`

**Observation:** `UnreconciledProcedure` (the list at the end of a fund reconciliation) and `OpenProcedureCandidate` (the candidates of a bank reconciliation, BAS-112) both mean a procedure that is `Created` and in no active fund-payment-group line; each query writes that predicate itself, and only the second adds "with a positive billed amount". One definition (B45, B46) removes the copy. Whether the fund reconciliation list should also leave out procedures with no positive amount is a functional question for the owner; until it is answered the two stay different on purpose.
