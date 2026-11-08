# Business Rules — Bank Account Management (BAC)

## Context

Bank accounts represent the practice's accounts on which bank entries are recorded. They identify the account when importing a PDF statement and let manual bank entries be associated with the correct account. Technical accounts, one per direct payment type, hold the direct payments and are never shown (BAC-055).

> Numbered R1–R9 until 2026-10-24 (#503); shipped migrations and older records name them so: R1 → BAC-010 to BAC-012 and BAC-017, R2 → BAC-030, R3 → BAC-041, R4 → BAC-050 to BAC-052, R5 → BAC-014, R6 → BAC-043, R7 → BAC-060, R8 → BAC-061, R9 → BAC-062. Since #518, BAC-050's cash account is BAC-054.

---

## Entity Definition

### BankAccount

An account of the practice on which bank entries are recorded.

| Field  | Business meaning                                                                         |
| ------ | ---------------------------------------------------------------------------------------- |
| `name` | How the user names the account; required.                                                |
| `iban` | The account's IBAN, optional; a PDF statement is matched to it.                          |
| `type` | `bank`, `cash`, `check` or `card` (BAC-050A); set by the system, never chosen (BAC-059). |

---

## Business Rules

### Account fields (010–019)

**BAC-010 — Name required (frontend + backend)**: An account has a name. An empty or blank name is rejected with a specific error.

**BAC-011 — IBAN optional (frontend + backend)**: The IBAN is optional, and its format is not checked. Without one, a PDF statement import cannot identify it (BAS-010).

**BAC-012 — IBAN stored without spaces (backend)**: An IBAN is stored without its spaces, and compared in that form.

**BAC-013 — Name uniqueness (frontend + backend)**: Two `bank` accounts cannot share a name (BAC-050A); names are compared exactly, case included, once their surrounding spaces are dropped. Creating or editing an account with such a name is rejected with a specific error, which the user reads as its own message, and nothing is saved (owner, 2026-10-24, #503). A deleted account is gone, so its name can be used again.

**BAC-014 — IBAN uniqueness (backend)**: Two accounts cannot share the same IBAN, so that account resolution by IBAN (used by the bank-statement import flow, see BAS-010) stays unambiguous. Creating or editing an account with an IBAN another account uses is rejected with a specific error. A deleted account is gone, so its IBAN can be used again (#584).

**BAC-015 — Signalled change (backend)**: Every account created, edited or deleted is signalled through the `BankAccountUpdated` event.

**BAC-016 — The list follows the change (frontend)**: On that signal, the list shows the accounts as they now are, with no reload by the user.

**BAC-017 — Name stored trimmed (backend)**: The spaces around a name are dropped before it is stored or compared.

### Creation (020–029)

**BAC-020 — Create (frontend + backend)**: The user creates an account from the add panel with a name and, optionally, an IBAN, under BAC-010 to BAC-014.

**BAC-021 — Created (frontend)**: Once created, the account appears in the list, the add panel's fields are cleared, and a message confirms it.

**BAC-022 — Creation refused (frontend)**: A refused creation keeps the typed values; its reason is shown under the name field and in a message.

### Edit (030–039)

**BAC-030 — Edit (frontend + backend)**: The name and IBAN of any `bank` account (BAC-051) can be edited, under BAC-010 to BAC-014. Editing an unknown account, a deleted one included, is rejected with a specific error.

**BAC-031 — Opening the edit (frontend)**: The edit dialog opens from a row's edit action or a double click on the row.

**BAC-032 — Edited (frontend)**: Once saved, the dialog closes and a message names the account.

**BAC-033 — Edit refused (frontend)**: A refused edit keeps the dialog open with the typed values, and a message gives the reason.

### Deletion (040–049)

**BAC-040 — Confirmation (frontend)**: Deleting an account first asks the user to confirm, naming it; cancelling deletes nothing.

**BAC-041 — Deletion (backend)**: Deletion really deletes the account and its bank statement labels (BAS-046). Deleting an unknown account, a deleted one included, is rejected with a specific error.

**BAC-042 — Deleted (frontend)**: Once deleted, the account leaves the list and a message names it.

**BAC-043 — An account holding bank entries is kept (frontend + backend)**: The user can ask to delete an account on which a bank entry is recorded; once they confirm, the deletion is refused with a specific error, which the user reads as BAC-044 says (owner, 2026-10-23, #448). An entry recorded at the same moment as the deletion still keeps the account, with the same refusal.

**BAC-044 — A refused deletion (frontend)**: When a deletion is refused or fails, the confirmation dialog closes and nothing is deleted; a message gives the reason of a refusal (BAC-041, BAC-043, BAC-051), and a generic one for any other failure (owner, 2026-10-24, #511).

### Account types (050–059)

**BAC-050** — removed (#518): the cash account, now BAC-054.

**BAC-050A — Account types (backend)**: Every account has a type: `bank`, one of the user's accounts, or `cash`, `check` or `card`, the technical account of that direct payment type (owner, 2026-11-07, #518).

**BAC-051 — A technical account is protected (backend)**: Editing or deleting a technical account is rejected with a specific error.

**BAC-052** — removed (#518): the cash account's translated name.

**BAC-053** — removed (#518): the cash account's row.

**BAC-054 — The technical accounts (backend)**: The `cash`, `check` and `card` accounts exist from the first launch, each with a fixed identity and no IBAN.

**BAC-055 — Only `bank` accounts are listed (backend)**: No listing returns a technical account, and none is read by its identity: it is unknown, but for an edit or a deletion, refused as BAC-051 says.

**BAC-055A — Only `bank` accounts are chosen (backend)**: A technical account given wherever an account is chosen — a FUND transfer (BSM-021), a refund (REF-070), a bank statement (BAS-063A), a bank entry edited onto it — is unknown.

**BAC-056 — A direct payment's account (backend)**: A patient's direct payment (BSM R14 to R20) is recorded on the technical account of its type — `CASH` on `cash`, `CHECK` on `check`, `CREDIT_CARD` on `card` — and an account given with it is ignored, even an unknown one (BSM-026). A refund paid by check or card stays on its `bank` account (REF-070).

**BAC-057 — Types on upgrade (backend)**: On upgrade, every existing account becomes a `bank` account but the former cash account, which becomes the `cash` account, and the `check` and `card` accounts are created.

**BAC-058 — Direct payments moved on upgrade (backend)**: On upgrade, every patient's direct payment moves to the technical account of its type, wherever it was recorded; the account it was on is not kept. A refund stays where it is (owner, 2026-11-07, #518).

**BAC-059 — A new account's type (backend)**: An account created by the user (BAC-020) or by a bank statement import (BAS-013) is a `bank` account; no other type can be created.

### Accounts on upgrade (060–069)

**BAC-060 — Accounts restored on upgrade (backend)**: An account deleted while a bank entry was recorded on it, before BAC-043 refused it, is no longer deleted after the upgrade: it reappears in the account list, and its entries can be read, edited and deleted again. Its bank statement labels do not come back (BAS-046) (owner, 2026-10-24, #448).

**BAC-061 — A restored account's taken name (backend)**: When another account uses its name, or another account restored by BAC-060 shares it, a restored account is named `{name} (restauré {first 8 characters of its id})`, stored as data and not translated (owner, 2026-10-24, #448).

**BAC-062 — A restored account's taken IBAN (backend)**: When another account uses its IBAN (BAC-014), a restored account (BAC-060) comes back without an IBAN (owner, 2026-10-24, #448).

**BAC-063 — Deleted accounts removed on upgrade (backend)**: An account deleted before BAC-041 took effect is deleted once, on upgrade, with its bank statement labels. One a bank entry still holds is kept and listed again, as BAC-060 to BAC-062 say, once the other deleted accounts are removed (owner, 2026-11-01, #579).

**BAC-064 — An upgrade refused (backend)**: The upgrade of BAC-057 is refused, and nothing changes, while a bank entry other than a patient's direct payment — a FUND transfer, a refund — is recorded on the former cash account: the application does not start and its log names the refusal; the entry is dealt with by hand first (owner, 2026-11-08, #518).

### The list (070–079)

**BAC-070 — Search (frontend)**: The search keeps the accounts whose name or stored IBAN contains the typed text as typed, ignoring case: an IBAN typed with spaces does not match (BAC-012).

**BAC-071 — Sort (frontend)**: A click on the name or IBAN column sorts by it ascending, a second click descending, a third removes the sort.

**BAC-072 — Loading (frontend)**: Until the accounts are read, the list says they are loading.

**BAC-073 — No account shown (frontend)**: When no account matches the search, or no `bank` account exists, the list says no bank account was found.

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
  → a bank entry is on it? ── yes → refused: the dialog closes, a message says why,
          │                         the account stays (BAC-043, BAC-044)
          │ no
          ▼
[Account deleted] → it leaves the list
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
- [x] Should the cash account's stored name (« Caisse ») keep counting as taken (BAC-013)? — Superseded by the owner on 2026-11-07 (#518): technical accounts are never shown (BAC-055) and uniqueness covers `bank` accounts only (BAC-013).
- [ ] Should a taken IBAN's reason (BAC-014) show under the IBAN field? Today every refused creation's reason shows under the name field (BAC-022).
- [ ] When a form breaks several rules at once, which reason is given? Today a taken IBAN is reported before the name's refusals.
- [ ] What does the user see when the accounts cannot be loaded? Today the list stays empty, with no message.
- [ ] In what order is the list shown before any sort (BAC-071)? Today the order is not set. And when sorting, do accounts without an IBAN come first, and does case count? Today they do, and it does.
