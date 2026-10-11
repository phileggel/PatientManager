# 2026-10-11 — DEBT-060 — The privacy check cannot see a value written into a log message itself

**Found by:** `reviewer-security` and `reviewer-frontend`, on the pull request that closed DEBT-059

**Where:** `scripts/privacy-check.py` (the `logs` check), `src/infra/logger.ts`, and four calls that still pass a `name`: `src/features/bank-account/add_bank_account_panel/useAddBankAccountPanel.ts`, `src/features/bank-account/gateway.ts`, `src/features/procedure-type/gateway.ts`, `src/features/excel-import/presentation/components/CreateProcedureTypeModal.tsx`

**Observation:** since DEBT-059 the frontend logger redacts every text a logged object holds, and it is the only caller of `log_frontend`. Two ways in remain that it cannot see, and no call uses them today: a value put into the message itself (a second string argument, a template literal — the two bank-account lines DEBT-059 removed were of that kind), and an object whose keys are values. `scripts/privacy-check.py` already reads the `logger.*` calls: it could refuse an argument after the message that is not an object literal, and a template literal that interpolates anything but an identifier. Lesser: the four calls above pass a `name` (of a bank account or a procedure type, not of a patient) that is now written as `[redacted]`, which says nothing; one of them is a `.tsx` file, so removing the key there carries the visual-proof rule.

**Size:** S

**Waits on the owner:** no
