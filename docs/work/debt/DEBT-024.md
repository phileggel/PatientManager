# 2026-10-03 — DEBT-024 — Support diagnostics: the encrypted bundle and the upload are not built

**Found by:** manual (TODO-011 closure, branch `feat/todo-011-diagnostic-report`)

**Where:** `src-tauri/src/use_cases/diagnostic_report/`, `docs/spec/diagnostic-report.md`

**Observation:** TODO-011 shipped its first tier only: a report with no patient data that the user saves and sends. Its entry also described a second tier, left out of its Done when and removed with it: a support bundle (logs plus a database snapshot) encrypted to the maintainer's public key, so only the maintainer can read it, sent through an upload-only file-drop link rather than an endpoint embedded in the app (which would invite abuse and a storage bill). It needs a consent prompt before the database is included, a retention rule and a privacy note (health data). A one-click upload of the first-tier report to a maintainer-run service was the other option not taken. Both are the owner's to decide and queue.
