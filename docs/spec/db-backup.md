# Business Rules — Database Backup and Restore

## Context

This feature lets the user export the local database to a compressed file, and restore a
database from a previously exported file. It addresses safety needs (backup before a risky
operation), migration (machine change), and post-incident recovery.

The database is SQLite, stored in the application's local directory. Compression uses the
gzip format (`.db.gz`).

---

## Frontend rules

**R1 — Dedicated modal**: The feature is reachable from a "Maintenance" entry in the
navigation drawer, visually separated from the rest of the navigation. Clicking this entry
opens a modal containing both actions (export and import).

**R2 — Export: destination file selection**: The user triggers the export through a
dedicated button. A native file-selection dialog opens (type `save`), pre-filtered to
`.db.gz` files, with a default name in the format `backup_YYYYMMDD_HHMMSS.db.gz`
(e.g. `backup_20260323_143022.db.gz`). The user can edit this name before confirming. The
export only starts after the destination is confirmed.

> Test coverage: verifying the exact format of the default name is intentionally omitted
> (trivial date-formatting behavior — the logic is directly readable in the code).

**R3 — Export: user feedback**: While exporting, the button is in a loading state. On
success, a success toast is displayed. On error, an error toast is displayed with the
message returned by the backend.

**R4 — Import: source file selection**: The user triggers the import through a dedicated
button. A native file-selection dialog opens (type `open`), pre-filtered to `.db.gz`
files.

**R5 — Import: mandatory confirmation**: Before any import, an explicit confirmation
dialog is displayed, stating that the current data will be **permanently replaced** by
the data in the selected file, and that the application will restart. The import only
proceeds after explicit user confirmation.

**R6 — Import: automatic relaunch**: After a successful import, the application restarts
automatically. A success toast is briefly displayed before the restart.

---

## Backend rules

**R7 — Backup file format**: The exported file is a SQLite database compressed with gzip.
Expected extension: `.db.gz`.

**R8 — Export: consistent copy**: The export produces a clean and consistent copy of the
database currently in use, without interrupting active connections.

**R9 — Import: validation**: On import, the file is decompressed and its validity is
verified before any modification of the active database. If verification fails, the
import is canceled and an error is returned.

**R10 — Import: deferred replacement**: The imported file does not directly overwrite the
active database — it is staged. The actual replacement happens on the next application
startup, before the database is opened.

**R11 — Temporary-file cleanup**: Any temporary file created during an export or an
import is systematically removed at the end of the operation, whether it succeeds or
fails.

**R12 — No automatic history**: The feature does not implement automatic backup rotation.
Each export produces a single file at the location chosen by the user. History management
is the user's responsibility.

---

## Constraints and limitations

- **Version compatibility**: A backup file can be imported into a different version of
  the application. If the backup is from an older version, missing migrations are applied
  automatically at startup. A backup from a **newer** version imported into an older
  version may cause errors — this case is not handled.

- **No encryption**: The `.db.gz` file is not encrypted. It contains all data in clear
  text. The user is responsible for the security of the exported file.

- **Restart required after import**: The application must restart for the imported file
  to take effect. This behavior is documented in the user interface.
