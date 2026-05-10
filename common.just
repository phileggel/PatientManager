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
    git fetch --prune
    git branch -vv | grep ': gone]' | awk '{print $1}' | xargs -r git branch -D

stat:
    cloc . --vcs=git

# Fast-forward current branch into main (no merge commit), then delete the branch
merge:
    #!/usr/bin/env bash
    set -euo pipefail
    branch=$(git rev-parse --abbrev-ref HEAD)
    if [ "$branch" = "main" ]; then echo "❌ Already on main — nothing to merge."; exit 1; fi
    git checkout main
    git merge --ff-only "$branch"
    git branch -d "$branch"
    echo "✅ $branch fast-forwarded into main and deleted."

# Run pending database migrations
# Prerequisites: sqlx must be on $PATH and DATABASE_URL must be set
migrate:
    cd src-tauri && sqlx migrate run

# Regenerate SQLx offline query cache (run after schema or query changes)
prepare-sqlx:
    cd src-tauri && DATABASE_URL="sqlite:.local/dev_check.sqlite" cargo sqlx prepare -- --tests

# Auto-fix formatting and linting
format:
    @cd src-tauri && cargo fmt
    @cd src-tauri && cargo clippy --fix --allow-dirty --quiet
    @npm run format:fix
    @npm run format:docs

# ⚠️  Destructive: deletes local database and recreates schema
clean-db:
    #!/usr/bin/env bash
    set -euo pipefail
    rm -rf src-tauri/.local/*
    cd src-tauri && sqlx database setup
