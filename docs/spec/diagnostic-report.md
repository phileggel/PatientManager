# Business Rules — Diagnostic Report (DGR)

## Context

When something goes wrong, the user sends support a report describing the state of the
installation. The report is a text file the user saves and sends themselves: nothing leaves the
machine automatically, and the file holds no practice data. This is the first tier of the support
diagnostics; an encrypted bundle that includes the database is a separate, later feature
(DEBT-024).

No entity is persisted: the report is a file, and the only value the screen receives is its
support code.

---

## Business Rules

### Entry and destination (010–019)

**DGR-010 — Entry point (frontend)**: The database backup dialog (opened from the "Maintenance"
entry of the navigation drawer; `db-backup.md` R1) has a third section, « Rapport de diagnostic »,
below export and restore. It holds a description stating that the report contains no patient
data, and one button, « Générer le rapport ».

**DGR-011 — Destination (frontend)**: The button opens a native save dialog filtered to `.txt`
files, with the default name `diagnostic-YYYYMMDD.txt` (local date). Cancelling the save dialog
does nothing.

**DGR-012 — Loading state (frontend)**: While the report is being written, the button is in a
loading state and cannot be pressed again.

**DGR-013 — Busy guard (frontend)**: The button is disabled while an export or a restore is
running. Writing a report does not disable export or restore.

**DGR-014 — Success display (frontend)**: Once the report is written, the section shows the saved
file's name and the report's support code. They stay until the database backup dialog is closed
or a new report is started.

**DGR-015 — Failure feedback (frontend)**: When the report cannot be written, an error toast
names the cause: the home directory could not be found (DGR-026), the destination is not allowed
(DGR-023), or the file could not be written (DGR-025). Nothing is shown as saved.

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
those tables only names and counts appear; the integrity check may add SQLite's internal row and
page numbers next to a table or index name, never a stored value. The migration history is
technical data and is listed (DGR-021). Of the log, only the lines the backend wrote are kept; a line forwarded from the screen
or written by a library is left out, because it can carry a file name or a message.

**DGR-023 — Destination validation (backend)**: The destination must be a `.txt` file (the
extension is matched without regard to case) in an existing folder that resolves under the
user's home directory, and must not be a symbolic link. An existing file is replaced: the save
dialog already asked. Any other destination is refused before anything is written.

**DGR-024 — Nothing is sent (backend)**: Generating a report writes one file. Nothing is
transmitted anywhere.

**DGR-025 — Best effort (backend)**: A part of the report that cannot be collected is written as
`unavailable:` followed by the database's or the file system's error text, which names tables
and columns, never a row's values; a log that exists but cannot be read is such a part. The rest
of the report is still produced. Once the destination is accepted, only a failure to write the
file fails the operation.

**DGR-026 — Home directory not found (backend)**: When the user's home directory cannot be
resolved, no destination can be validated and the operation fails with that cause.

### Log hygiene (030–039)

**DGR-030 — Log reset on version change (backend)**: When the application starts and the log
file was written by another version, or by a version that did not record which one it was, the
log is emptied before logging begins.

**DGR-031 — Reset failure (backend)**: If the log cannot be emptied, the application starts
anyway and logs a warning.

---

## Workflow

```
« Générer le rapport » → save dialog ──cancel──→ nothing
                              │
                         destination
                              │
        backend validates it (DGR-023, DGR-026) ──refused──→ error toast (DGR-015)
                              │
          collects the parts (DGR-021, DGR-025), writes the file ──fails──→ error toast
                              │
        section shows the file name and the support code (DGR-014)
```

---

## UX Draft

### Entry Point

The « Rapport de diagnostic » section of the database backup dialog, under « Restaurer une
sauvegarde ». Validated by the owner from mocks on 2026-10-03; the shipped screen is
`screenshots/DbBackupModal-{light,dark}-{open,saved}.png`.

### States

- **Idle**: title, description, a secondary button « Générer le rapport ».
- **Writing**: the button shows a spinner (DGR-012).
- **Saved**: a notice above the button — « Rapport enregistré : » and the file name, then
  « Envoyez ce fichier au support et indiquez le code » and the support code (DGR-014).
- **Failed**: an error toast; the section is back to idle (DGR-015).

---

## Open Questions

- [x] Which log lines may the report carry? — Decided by the owner on 2026-10-03: the log is
      emptied when the version changes (DGR-030). Following the security review, the report also
      keeps only the lines the backend wrote (DGR-022).
- [x] How does the report reach support? — Decided by the owner on 2026-10-03: saved to a file
      the user sends; no upload.

None — all questions have been resolved.
