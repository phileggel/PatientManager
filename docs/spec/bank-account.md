# Business Rules — Bank Account Management (bank-account)

## Context

Bank accounts represent the practitioner's accounts from which transfers are tracked. They identify the account when importing a PDF statement and let manual transfers be associated with the correct account.

---

## Business Rules

**R1 — Account fields (frontend + backend)**: A bank account is identified by a name and an IBAN. The IBAN is optional but required for the automatic PDF statement import flow to identify the matching account.

**R2 — Edit (frontend + backend)**: The name and IBAN can be edited at any time.

**R3 — Delete (frontend + backend)**: Deletion is a soft-delete — the account is marked as deleted but stays in the database. There is no blocking constraint when the account is linked to existing transfers.

**R4 — Default cash account (backend)**: A cash account is pre-created by migration with the fixed id `cash-account-default`. It has no IBAN, cannot be edited, and cannot be deleted. It exists exclusively to record cash payments. Its display name comes from i18n, not from the database.

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
