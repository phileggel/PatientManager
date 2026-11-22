# Business Rules — Diagnostic Report (DGR)

## Context

When something goes wrong, the user sends support a report describing the state of the
installation. The report is a text file the user saves and sends themselves: nothing leaves the
machine automatically, and the file holds no patient data: no name, social security number,
IBAN or amount (DGR-022, DGR-032). This is the first tier of the support
diagnostics; an encrypted bundle that includes the database is a separate, later feature
(DEBT-024).

When a start-up fails, the application used to close with no word (#730): it now stays open,
says what failed, and lets the user save a failure report for support (DGR-040 to DGR-045).

No entity is persisted: a report is a file that gives its support code and, after a start-up
that failed, what failed (DGR-041).

---

## Business Rules

### Report content (020–029)

**DGR-020 — Support code (backend)**: Each report carries a support code of eight characters in
two groups (`XXXX-XXXX`), drawn at random from an alphabet without look-alike characters (no
`0`/`O`, no `1`/`I`). The code is written in the report and given back with the result, so the
user can quote it.

**DGR-021 — Content (backend)**: The report is plain text in English, not localised, and holds,
in order: the support code; the date and time it was generated (UTC); the application version,
the operating system and architecture; the applied migrations (version, description, success);
the result of the database integrity check; the foreign-key check as a number of violations per
table; the number of rows of every table of the database except SQLite's internal ones; and the
last 200 lines the backend wrote to the application log (all of them when there are fewer). An
empty part reads `(none)`; a foreign-key check with nothing to report reads `0 violations`; an
absent log reads `(no log file)`.

**DGR-022 — No practice data (backend)**: The report contains no value read from a row of a
table that holds practice data (patients, funds, procedures, payments, bank data, labels): for
those tables only names and counts appear, and in a log line only what DGR-032 allows; the integrity check may add SQLite's internal row and
page numbers next to a table or index name, never a stored value. The migration history is
technical data and is listed (DGR-021). Of the log, only the lines the backend wrote are kept; a line forwarded from the screen
or written by a library is left out, because it can carry a file name or a message.

**DGR-023 — Destination validation (backend)**: The destination must be a `.txt` file (the
extension is matched without regard to case) in an existing folder that resolves under the
user's home directory but not inside the app's own folders (its data folder, which holds the
database, and its log folder), and must not be a symbolic link. An existing file is replaced:
the save dialog already asked (DGR-027). Any other destination is refused before anything is
written.

**DGR-024 — Nothing is sent (backend)**: Generating a report writes one file. Nothing is
transmitted anywhere.

**DGR-025 — Best effort (backend)**: A part of the report that cannot be collected is written as
`unavailable:` followed by the database's or the file system's error text, which names tables
and columns, never a row's values; a log that exists but cannot be read is such a part. The rest
of the report is still produced. Once the destination is accepted, only a failure to write the
file fails the operation.

**DGR-026 — Home directory not found (backend)**: When the user's home directory cannot be
resolved, no destination can be validated and the operation fails with that cause.

**DGR-027 — Writing the report (backend)**: Whether or not a file already exists at the
destination, the report is written to a new file in the same folder, readable by its owner only,
then moved over the destination: a link put at that name after DGR-023's check is replaced, never
followed. When the write or the move fails, the new file is removed, so the operation leaves no
file beside the destination (DGR-024).

### Log hygiene (030–039)

**DGR-030 — Log reset on version change (backend)**: When the application starts and the log
file was written by another version, or by a version that did not record which one it was, the
log is emptied before logging begins.

**DGR-031 — Reset failure (backend)**: If a log that exists cannot be emptied, the application starts
anyway and logs a warning.

**DGR-032 — What a log line may hold (backend)**: A line the backend writes gives a value read
from a row only as an identifier, a count, a date, a type or a yes/no, and of an IBAN at most its
last four characters; never a name, a social security number or an amount (owner, 2026-11-22,
#730; an IBAN's last four as the backend's log rules allow). The backend writes its lines so; a
report copies them as they are.

### Start-up failure (040–049)

**DGR-040 — A database that cannot be made ready (backend)**: When the database cannot be made
ready at start-up — applying a staged import (db-backup R10), opening it, the backup of DGR-042,
the repair of the upgrade history an older build recorded, a repair a rule asks for before a
migration (BSM-038A), or a migration — the application does not close: the failure is recorded, no later
stage runs, and the failure can be read until the application closes.

**DGR-040A — What a failed migration leaves (backend)**: The migrations before the failing one
stay applied; the failing one leaves nothing of itself.

**DGR-041 — What the failure says (backend)**: The failure gives: its stage, one of DGR-040's or
another stage (DGR-045); for a migration, its version and description, when known; the text of
the error's innermost cause only, the one that names the database's or the file system's
failure, or the application's own text when it raised the failure itself, the user's home
folder in it written `~`; and whether the
backup of DGR-042 was saved before the failure.

**DGR-042 — The backup before an upgrade (backend)**: When migrations are pending on an existing
database, a backup of the database is saved beside it before the start-up's repairs or
migrations change it, as a new file named by the version it precedes and its date and time; none
is replaced or removed by the application. On a new database, or with nothing pending, no backup
is made. It is an exception to db-backup R12: the application makes it, at no place the user
chose.

**DGR-043 — The failure report (backend)**: After a start-up failure, a failure report can be
written as DGR-023 to DGR-027 say for the diagnostic report. It holds, in order: the support code
(DGR-020); the date and time it was generated (UTC); the application version, the operating
system and the architecture; the failure as DGR-041 gives it; and the log lines of the failed
start-up (DGR-043A). It holds nothing read from the database (no migration history, check or
count) and is plain text in English, not localised; its cause is the database's, the file
system's or the application's text (DGR-025, DGR-041), its log lines what DGR-032 allows.

**DGR-043A — The log part of the failure report (backend)**: The log part keeps the lines
DGR-022 keeps, from the last line that opens a start-up, the one naming the application's
version, to the end of the log, at most the last 200 of them; with no line opening a start-up,
the last 200 kept lines. With no log file, or when the log could not be made at start-up even if
an older log file exists, it reads `(no log file)`; with a log that cannot be read,
`unavailable:` as DGR-025 says.

**DGR-044 — No failure recorded (backend)**: When the start-up succeeded, reading the start-up
failure gives none.

**DGR-044A — No failure, no report (backend)**: When the start-up succeeded, a failure report is
refused with a specific error; nothing is validated or written.

**DGR-045 — Any other start-up failure (backend)**: A start-up that fails other than at
DGR-040's stages — before the database is opened: the application's folders cannot be made, or
its log cannot be opened for writing — is recorded the same way, its stage being another stage
and the backup of DGR-042 not taken.

---

## Workflow

```
a destination ──refused (DGR-023, DGR-026)──→ a specific error
      │
collect the parts (DGR-021, DGR-025), write the file ──fails──→ a specific error
      │
the file is written; the result gives the support code (DGR-020)
```

```
a start-up ──fails (DGR-040, DGR-045)──→ the failure is recorded (DGR-041)
      │                                         │
the start-up succeeds                  a failure report is asked for
      │                                         │
a failure report ──refused (DGR-044A)──→ a specific error
                                                │
                                        a destination ──refused (DGR-023, DGR-026)──→ a specific error
                                                │
                                   the report is written (DGR-043) ──fails (DGR-025, DGR-027)──→ a specific error
```

---

## Open Questions

- [ ] While a start-up has failed, every action other than reading the failure, writing its
      failure report, closing the application and installing an update finds nothing to act on:
      whether a rule states that refusal and its error is not stated (#730).
- [ ] The backups of DGR-042 build up beside the database (DGR-042): whether any should be
      removed is not stated; after a failed migration the next start-up
      backs up the partly upgraded database (DGR-040A); and such a backup is a database file,
      not db-backup's `.db.gz`, so the import of R9 does not take it. Whether rules should say
      so is not stated.
- [ ] A staged import that fails at start-up (DGR-040's first stage): whether the staged file
      is kept, so the next start-up tries it again, or discarded is not stated.
- [ ] The repair of the upgrade history an older build recorded (DGR-040) has no rule of its
      own: what it corrects and when it runs is not stated.

- [ ] A report written while an export or a restore runs: the backend does not prevent it; whether DGR-025's best effort answers what it then holds is not stated.
- [x] Which log lines may the report carry? — Decided by the owner on 2026-10-03: the log is
      emptied when the version changes (DGR-030). Following the security review, the report also
      keeps only the lines the backend wrote (DGR-022).
- [x] How does the report reach support? — Decided by the owner on 2026-10-03: saved to a file
      the user sends; no upload.
