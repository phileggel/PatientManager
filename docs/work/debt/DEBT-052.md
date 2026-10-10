# 2026-10-10 — DEBT-052 — The patient picker of a bank transfer writes "N/A" outside the translations

**Found by:** reviewer-frontend (branch `refactor/debt-038-latest-date-is-nullable`; the line is not in that diff)

**Where:** `src/features/bank-transfer/add_bank_transfer_form/useSelectPatientModal.ts` (`formatDateOrNA`), `src/features/bank-transfer/add_bank_transfer_form/SelectPatientModal.tsx`

**Observation:** a patient with no procedure shows "N/A" as latest date, a text written in the hook; the component already has a `na` translation key for the name and the SSN. A French user reads "N/A" either way today, so the fix changes nothing visible in French; it is the F rule on text outside `t()`.
