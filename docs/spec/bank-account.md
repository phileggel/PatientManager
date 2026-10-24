# Business Rules — Bank Account Management (bank-account)

## Context

Bank accounts represent the practitioner's accounts from which bank entries are tracked. They identify the account when importing a PDF statement and let manual bank entries be associated with the correct account.

---

## Business Rules

**R1 — Account fields (frontend + backend)**: A bank account is identified by a name and an IBAN. The IBAN is optional but required for the automatic PDF statement import flow to identify the matching account.

**R2 — Edit (frontend + backend)**: The name and IBAN can be edited at any time.

**R3 — Delete (frontend + backend)**: Deletion is a soft-delete — the account is marked as deleted but stays in the database.

**R4 — Default cash account (backend)**: A cash account is pre-created by migration with the fixed id `cash-account-default`. It has no IBAN, cannot be edited, and cannot be deleted. It exists exclusively to record cash payments. Its display name comes from i18n, not from the database.

**R5 — IBAN uniqueness (backend)**: Two accounts cannot share the same IBAN. The constraint applies across all accounts including soft-deleted ones, so that account resolution by IBAN (used by the bank-statement import flow, see BAS-010) stays unambiguous even after deletion. Attempting to create or edit an account with an IBAN already used by another account — active or soft-deleted — is rejected with an error.

**R6 — An account holding bank entries is kept (frontend + backend)**: The user can ask to delete an account on which a bank entry is recorded; once they confirm, the deletion is refused, a message says why, and the account stays in the list (owner, 2026-10-23, #448).

**R7 — Accounts restored on upgrade (backend)**: An account soft-deleted while a bank entry was recorded on it, before R6 refused it, is no longer deleted after the upgrade: it reappears in the account list, and its entries can be read, edited and deleted again. Its bank statement labels do not come back (BAS-046) (owner, 2026-10-24, #448).

**R8 — A restored account's taken name (backend)**: When an active account uses its name, or another account restored by R7 shares it, a restored account is named `{name} (restauré {first 8 characters of its id})`, stored as data and not translated (owner, 2026-10-24, #448).

**R9 — A restored account's taken IBAN (backend)**: When another account, deleted or not, uses its IBAN (R5), a restored account (R7) comes back without an IBAN (owner, 2026-10-24, #448).

---

## Workflow

```
[User creates / edits an account]
  → Enter name and IBAN (optional)
  → Validation
          │
          ▼
[Account saved]
```

## Open Questions

- [ ] Is the user told, after the upgrade, which accounts R7 restored, R8 renamed or R9 left without an IBAN? An account without one is no longer found by a PDF import (BAS-010).
