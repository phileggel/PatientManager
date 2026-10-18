# 2026-10-18 — DEBT-072 — The fund payment reconciliation contract names errors the code no longer answers

**Found by:** `contract-reviewer` on TODO-008's first pull request, findings that predate the branch

**Where:** `docs/contracts/fund-payment-reconciliation-contract.md`, `src-tauri/src/use_cases/fund_payment_reconciliation/error.rs`, `api.rs`

**Observation:** the contract lists `DuplicatePdf` where the code answers `AllDuplicates` / `NoValidCandidates[AfterCorrections]`; `InvalidDateFormat` on `get_unreconciled_procedures_in_range` where the code answers `InvalidDateRange`; `ParseFailed` on `parse_pdf_text`, whose handler cannot fail; and neither create command lists `DatabaseError`, which FPA-076 promises. A contract drifting from right code: gated "when next touched" by `/contract`.

**Size:** S

**Waits on the owner:** no
