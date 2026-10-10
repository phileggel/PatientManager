# 2026-10-05 — DEBT-036 — `RESET_DATABASE` deletes the database in release builds too

**Found by:** reviewer-security (a note on branch `refactor/todo-016-core-without-the-shell`; pre-existing)

**Where:** `src-tauri/src/app.rs` (`initialize_app`), `src-tauri/src/shared/infrastructure/db.rs`

**Observation:** when the environment variable `RESET_DATABASE` is `true` or `1`, the application deletes its database file at start-up, in every build. Like DEBT-028 before it, setting it needs control of the user's environment, so the risk is low; but a shipped binary has no use for it and the loss is the user's data. Read it in a debug build only, with the same test shape as `db_path_for`.
