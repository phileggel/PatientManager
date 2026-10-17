# 2026-10-05 — DEBT-037 — The patient feature has no spec

**Found by:** contract-reviewer (branch `fix/patient-edit-is-validated`)

**Where:** `docs/contracts/patient-contract.md`

**Observation:** the patient contract was derived from the code; no `docs/spec/` document states the patient rules (a name is required unless anonymous, an SSN is 13 ASCII digits, an edit validates only what it changes), so they carry no rule id and no `spec-checker` reads them. Owner's decision: write a patient spec with `/spec-writer`, or keep the contract as the only record.

**Size:** L

**Waits on the owner:** no — the contract is the record until the patient feature's next `feat` or `fix`, which writes the spec with `/spec-writer` (owner, 2026-10-17)
