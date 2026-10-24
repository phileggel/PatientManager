# Business Rules — Bank Account Management (BAC)

## Context

Bank accounts represent the practice's accounts on which bank entries are recorded. They identify the account when importing a PDF statement and let manual bank entries be associated with the correct account. A cash account, present from the first launch, holds the cash payments.

> Numbered R1–R9 until 2026-10-24 (#503); shipped migrations and older records name them so: R1 → BAC-010 to BAC-012 and BAC-017, R2 → BAC-030, R3 → BAC-041, R4 → BAC-050 to BAC-052, R5 → BAC-014, R6 → BAC-043, R7 → BAC-060, R8 → BAC-061, R9 → BAC-062.

---

## Entity Definition

### BankAccount

An account of the practice on which bank entries are recorded.

| Field        | Business meaning                                                     |
| ------------ | -------------------------------------------------------------------- |
| `name`       | How the user names the account; required.                            |
| `iban`       | The account's IBAN, optional; a PDF statement is matched to it.      |
| `is_deleted` | The account was deleted: kept for its history, hidden from the list. |

---

## Business Rules

### Account fields (010–019)

**BAC-010 — Name required (frontend + backend)**: An account has a name. An empty or blank name is rejected with a specific error.

**BAC-011 — IBAN optional (frontend + backend)**: The IBAN is optional, and its format is not checked. Without one, a PDF statement import cannot identify it (BAS-010).

**BAC-012 — IBAN stored without spaces (backend)**: An IBAN is stored without its spaces, and compared in that form.

**BAC-013 — Name uniqueness (backend)**: Two accounts that are not deleted, the cash account included under its stored name, cannot share a name; names are compared exactly, case included, once their surrounding spaces are dropped. Creating or editing an account with such a name is rejected with a specific error, which the user reads as its own message, and nothing is saved (owner, 2026-10-24, #503). A deleted account's name can be used again.

**BAC-014 — IBAN uniqueness (backend)**: Two accounts cannot share the same IBAN. The constraint applies across all accounts, deleted or not, so that account resolution by IBAN (used by the bank-statement import flow, see BAS-010) stays unambiguous even after deletion. Attempting to create or edit an account with an IBAN already used by another account — deleted or not — is rejected with a specific error.

**BAC-015 — Signalled change (backend)**: Every account created, edited or deleted is signalled through the `BankAccountUpdated` event.

**BAC-016 — The list follows the change (frontend)**: On that signal, the list shows the accounts as they now are, with no reload by the user.

**BAC-017 — Name stored trimmed (backend)**: The spaces around a name are dropped before it is stored or compared.

### Creation (020–029)

**BAC-020 — Create (frontend + backend)**: The user creates an account from the add panel with a name and, optionally, an IBAN, under BAC-010 to BAC-014.

**BAC-021 — Created (frontend)**: Once created, the account appears in the list, the add panel's fields are cleared, and a message confirms it.

**BAC-022 — Creation refused (frontend)**: A refused creation keeps the typed values; its reason is shown under the name field and in a message.

### Edit (030–039)

**BAC-030 — Edit (frontend + backend)**: The name and IBAN of any account but the cash account (BAC-051) can be edited, under BAC-010 to BAC-014. Editing an account that is unknown or deleted is rejected with a specific error.

**BAC-031 — Opening the edit (frontend)**: The edit dialog opens from a row's edit action or a double click on the row.

**BAC-032 — Edited (frontend)**: Once saved, the dialog closes and a message names the account.

**BAC-033 — Edit refused (frontend)**: A refused edit keeps the dialog open with the typed values, and a message gives the reason.

### Deletion (040–049)

**BAC-040 — Confirmation (frontend)**: Deleting an account first asks the user to confirm, naming it.

**BAC-041 — Soft-delete (backend)**: Deletion marks the account as deleted: it is kept, hidden from the list, and its bank statement labels are deleted (BAS-046). Deleting an account that is unknown or already deleted is rejected with a specific error.

**BAC-042 — Deleted (frontend)**: Once deleted, the account leaves the list and a message names it.

**BAC-043 — An account holding bank entries is kept (frontend + backend)**: The user can ask to delete an account on which a bank entry is recorded; once they confirm, the deletion is refused, a message says why, and the account stays in the list (owner, 2026-10-23, #448).

**BAC-044 — A refused deletion keeps its dialog (frontend)**: When a deletion is refused or fails, the confirmation dialog stays open and a message gives the reason.

### The cash account (050–059)

**BAC-050 — Default cash account (backend)**: A cash account exists from the first launch, with a fixed identity and no IBAN. Every cash payment is recorded on it (BSM-026); whether another kind of entry may be is an open question of `bank-statement-manual-match.md`.

**BAC-051 — The cash account is protected (backend)**: Editing or deleting the cash account is rejected with a specific error.

**BAC-052 — The cash account's name (frontend)**: Wherever the cash account is shown — the account list and the bank entry forms — its name comes from the translations, not from the stored data.

**BAC-053 — The cash account's row (frontend)**: In the list, the cash account's edit and delete actions are disabled, a double click on its row does nothing, and the row says it is managed automatically.

### Accounts restored on upgrade (060–069)

**BAC-060 — Accounts restored on upgrade (backend)**: An account deleted while a bank entry was recorded on it, before BAC-043 refused it, is no longer deleted after the upgrade: it reappears in the account list, and its entries can be read, edited and deleted again. Its bank statement labels do not come back (BAS-046) (owner, 2026-10-24, #448).

**BAC-061 — A restored account's taken name (backend)**: When an account that is not deleted uses its name, or another account restored by BAC-060 shares it, a restored account is named `{name} (restauré {first 8 characters of its id})`, stored as data and not translated (owner, 2026-10-24, #448).

**BAC-062 — A restored account's taken IBAN (backend)**: When another account, deleted or not, uses its IBAN (BAC-014), a restored account (BAC-060) comes back without an IBAN (owner, 2026-10-24, #448).

### The list (070–079)

**BAC-070 — Search (frontend)**: The search keeps the accounts whose name or stored IBAN contains the typed text as typed, ignoring case: an IBAN typed with spaces does not match (BAC-012).

**BAC-071 — Sort (frontend)**: A click on the name or IBAN column sorts by it ascending, a second click descending, a third removes the sort.

**BAC-072 — Loading (frontend)**: Until the accounts are read, the list says they are loading.

**BAC-073 — No account shown (frontend)**: When no account matches the search, the list says no bank account was found. The cash account is always listed (BAC-050), so this is the only empty list.

---

## Workflow

```
[User creates / edits an account]
  → Enter name and IBAN (optional)
  → Validation (BAC-010 to BAC-014) ── refused → the form keeps its values,
          │                              a message says why (BAC-022, BAC-033)
          ▼
[Account saved] → the list shows it

[User deletes an account] → confirms
  → a bank entry is on it? ── yes → refused, the account stays (BAC-043)
          │ no
          ▼
[Account soft-deleted] → it leaves the list
```

---

## UX Draft

### Entry Point

The bank accounts page, from the navigation drawer.

### Main Component

A page: the account list with its search, and a side panel with the add form. Editing opens a dialog with the same form; deleting opens a confirmation dialog.

### States

- **Empty**: the list says no bank account was found (BAC-073).
- **Loading**: the list says the accounts are loading (BAC-072).
- **Error**: a refused creation shows its reason under the name field (BAC-022); a refused edit or deletion shows a message (BAC-033, BAC-044).
- **Success**: BAC-021, BAC-032, BAC-042.

### User Flow

1. The user fills the add panel's name and, optionally, the IBAN, and creates the account.
2. A double click on a row, or its edit action, opens the edit dialog.
3. The delete action asks for confirmation, then deletes the account or says why it cannot.

---

## Open Questions

- [ ] Is the user told, after the upgrade, which accounts BAC-060 restored, BAC-061 renamed or BAC-062 left without an IBAN? An account without one is no longer found by a PDF import (BAS-010).
- [ ] Should the cash account's stored name (« Caisse ») keep counting as taken (BAC-013), though the cash account shows a translated name (BAC-052) and the user may never have seen it?
- [ ] When a form breaks several rules at once, which reason is given? Today a taken IBAN is reported before the name's refusals.
- [ ] What does the user see when the accounts cannot be loaded? Today the list stays empty, with no message.
- [ ] In what order is the list shown before any sort (BAC-071)? Today the order is not set. And when sorting, do accounts without an IBAN come first, and does case count? Today they do, and it does.
