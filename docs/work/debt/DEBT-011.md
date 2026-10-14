# 2026-08-02 — DEBT-011 — Logging target absent across procedure repository

**Found by:** reviewer-backend (branch `feat/bank-born-groups` @ `ed6f214`, severity 🔵)

**Where:** `src-tauri/src/context/procedure/repository/procedure.rs`

**Observation:** all ~21 pre-existing `tracing::*!` calls in this file omit `target: BACKEND` (B29/B30); only the new BAS-112 debug line carries it, leaving the file internally inconsistent with the backend logging convention. A file-wide sweep is its own story — not per-line patches inside feature PRs.

**Size:** S

**Waits on the owner:** no

**Refined (2026-10-14, before queuing):** 22 `tracing::` calls in `context/procedure/repository/procedure.rs`, 2 with `target: BACKEND`. Done when: all 22 carry it; nothing else in the file changes. Size S holds.
