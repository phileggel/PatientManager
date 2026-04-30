# Kit version

claude-kit **v3.9.1** — synced 2026-04-30

## Changes since v3.5.0 (your previous sync)

- v3.9.1: (no changes recorded)
- v3.9.0: add mirror-local script and pre-merge-commit hook; add create-pr skill and remove spec-diff and workflow-validator; enforce branch workflow and fix reviewer file scope; use --no-verify on release commits to bypass main hook; sync pre-merge-commit hook and replace awk in create-pr; dynamic base branch in create-pr, Tauri-only on generate-types; add utf-8 encoding to remaining open() call; add utf-8 encoding to open() calls in sync.sh and prune shipped TODOs
- v3.8.0: add integration test step to test-writer-backend; scope artifact scan to changes since last release tag; address preflight warnings in generic agents; add clippy to web fast mode and neutralize SQLX_OFFLINE rule; add missing format recipe to web.just; make spec-diff code search profile-neutral; neutralize Tauri-specific paths in generic agents; extend check-kit agent coverage to all profile dirs; remove hardcoded server/ paths in web profile
- v3.7.0: add web profile for Axum + React 19 + PostgreSQL projects; replace compound Bash constructs with separate tool calls in agents and skills
- v3.6.0: add prune skill for project-wide KISS audit
