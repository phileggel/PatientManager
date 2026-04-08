sync-kit:
    ./scripts/sync-config.sh

# Run fast quality check (lint/format only, no tests)
check:
    python3 scripts/check.py --fast

# Run full quality check (tests + build + lint)
check-full:
    python3 scripts/check.py

# Release new version (interactive)
release *ARGS:
    python3 scripts/release.py {{ARGS}}

# Auto-fix formatting and linting
format:
    cd src-tauri && cargo fmt
    cd src-tauri && cargo clippy --fix --allow-dirty
    npm run format:fix
    npm run format:docs

# Run pending database migrations
# Prerequisites: sqlx must be on $PATH and DATABASE_URL must be set
migrate:
    cd src-tauri && sqlx migrate run

# Regenerate SQLx offline query cache (run after schema or query changes)
prepare-sqlx:
    cd src-tauri && DATABASE_URL="sqlite:.local/dev_check.sqlite" cargo sqlx prepare -- --tests

# ⚠️  Destructive: deletes local database and recreates schema
clean-db:
    #!/usr/bin/env bash
    set -euo pipefail
    rm -rf src-tauri/.local/*
    cd src-tauri && sqlx database setup

# ⚠️  Destructive: removes stale remote-tracking branches
clean-branches:
    git fetch --prune
    git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -D || true

stat:
    cloc . --vcs=git