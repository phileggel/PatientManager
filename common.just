# Common recipes — synced from kit to downstream projects via sync-config.sh

sync-kit *args:
    ./scripts/sync-config.sh {{args}}

# Run fast quality check (lint/format only, no tests)
check:
    @[ -f scripts/check.py ] || { echo "❌ scripts/check.py not found — run: just sync-kit"; exit 1; }
    python3 scripts/check.py --fast

# Run full quality check (tests + build + lint)
check-full:
    @[ -f scripts/check.py ] || { echo "❌ scripts/check.py not found — run: just sync-kit"; exit 1; }
    python3 scripts/check.py

# Release new version (interactive)
release *ARGS:
    @[ -f scripts/release.py ] || { echo "❌ scripts/release.py not found — run: just sync-kit"; exit 1; }
    python3 scripts/release.py {{ARGS}}

# ⚠️  Destructive: removes stale remote-tracking branches
clean-branches:
    #!/usr/bin/env bash
    set -euo pipefail
    git fetch --prune
    # Portable equivalent of `xargs -r` (which is GNU-only — BSD/macOS
    # xargs runs the command once with no arguments instead of skipping).
    stale=$(git branch -vv | grep ': gone]' | awk '{print $1}')
    [ -n "$stale" ] && echo "$stale" | xargs git branch -D || true

stat:
    cloc . --vcs=git

# Fast-forward merge the current feature branch into main and delete it.
# Refuses with a specific diagnostic + recovery command if FF is not safe
# (squash/rebase merge on GitHub, divergence, dirty tree, etc.). Override
# in the downstream justfile if your project needs a different policy.
merge:
    @[ -f scripts/merge.py ] || { echo "❌ scripts/merge.py not found — run: just sync-kit"; exit 1; }
    python3 scripts/merge.py

# Run pending database migrations
# Prerequisites: sqlx must be on $PATH and DATABASE_URL must be set
migrate:
    @if [ -d src-tauri ]; then cd src-tauri && sqlx migrate run; else echo "ℹ skipping migrate (no src-tauri/)"; fi

# Regenerate SQLx offline query cache (run after schema or query changes).
# SQLX_OFFLINE=false forces online mode — projects that set SQLX_OFFLINE=true
# globally (in their .cargo/config.toml) still let `prepare` hit the live DB,
# which is its whole purpose. No-op for projects that haven't set SQLX_OFFLINE.
# Override `DATABASE_URL` in your local justfile if your dev DB lives elsewhere.
prepare-sqlx:
    @if [ -d src-tauri ]; then cd src-tauri && SQLX_OFFLINE=false DATABASE_URL="sqlite:.local/dev_check.sqlite" cargo sqlx prepare -- --tests; else echo "ℹ skipping prepare-sqlx (no src-tauri/)"; fi

# Auto-fix formatting and linting
format:
    @if [ -d src-tauri ]; then cd src-tauri && cargo fmt; else echo "ℹ skipping cargo fmt (no src-tauri/)"; fi
    @if [ -d src-tauri ]; then cd src-tauri && cargo clippy --fix --allow-dirty --quiet; else echo "ℹ skipping clippy (no src-tauri/)"; fi
    @npm run format:fix
    @npm run format:docs

# ⚠️  Destructive: deletes local database and recreates schema
clean-db:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d src-tauri ]; then
        echo "ℹ skipping clean-db (no src-tauri/)"
        exit 0
    fi
    rm -rf src-tauri/.local/*
    cd src-tauri && sqlx database setup
