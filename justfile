# PatientManager - Command Runner
# Install just: https://github.com/casey/just

# List all available commands
default:
    @just --list

# Run fast quality check (lint/format only, no tests)
check:
    python3 scripts/check.py --fast

# Run full quality check (tests + build + lint)
check-full:
    python3 scripts/check.py

# Release new version (interactive)
release *ARGS:
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

# Unit tests of the repository's own scripts
test-scripts:
    python3 -m unittest discover -s scripts/tests -p "test_*.py"

# Fast-forward merge the current feature branch into main and delete it.
# Refuses unless the branch is the head of an open PR with every check green
# (required-checks.json), or if FF is not safe (divergence, dirty tree, etc.).
merge:
    python3 scripts/merge.py

# Run pending database migrations
# Prerequisites: sqlx must be on $PATH and DATABASE_URL must be set
migrate:
    @if [ -d src-tauri ]; then cd src-tauri && sqlx migrate run; else echo "ℹ skipping migrate (no src-tauri/)"; fi

# Regenerate SQLx offline query cache (run after schema or query changes).
# SQLX_OFFLINE=false forces online mode — projects that set SQLX_OFFLINE=true
# globally (in their .cargo/config.toml) still let `prepare` hit the live DB,
# which is its whole purpose. No-op for projects that haven't set SQLX_OFFLINE.
# Edit `DATABASE_URL` below if your dev DB lives elsewhere.
prepare-sqlx:
    @if [ -d src-tauri ]; then cd src-tauri && SQLX_OFFLINE=false DATABASE_URL="sqlite:.local/dev_check.sqlite" cargo sqlx prepare -- --tests; else echo "ℹ skipping prepare-sqlx (no src-tauri/)"; fi

# Auto-fix formatting and linting
format:
    @if [ -d src-tauri ]; then cd src-tauri && cargo fmt; else echo "ℹ skipping cargo fmt (no src-tauri/)"; fi
    @if [ -d src-tauri ]; then cd src-tauri && cargo clippy --fix --allow-dirty --quiet; else echo "ℹ skipping clippy (no src-tauri/)"; fi
    @if [ -f package.json ]; then npm run format:fix; else echo "ℹ skipping format:fix (no package.json)"; fi
    @if [ -f package.json ]; then npm run format:docs; else echo "ℹ skipping format:docs (no package.json)"; fi

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

# Start the application with hot reload
dev *ARGS:
    ./scripts/start-app.sh {{ARGS}}

# Regenerate Specta bindings: the project uses a dedicated binary for binding generation.
# The binary lives at `src-tauri/dev/generate_bindings.rs` (out of src/bin/ per
# gh#41 — Tauri's NSIS bundler walks src/bin/ and fails on phantom .exe entries).
generate-types:
    cd src-tauri && cargo run --bin generate_bindings

# Regenerate dev fixture files for the import codec (IFC-033)
# Writes src-tauri/tests/fixtures/{surface}/{scenario}.{ext} + .expected.json.
# Optional SCENARIO arg: regenerate only that scenario.
regen-fixtures SURFACE='excel' SCENARIO='':
    cd src-tauri && cargo run --features dev-fixtures --bin generate_fixtures -- {{SURFACE}} {{SCENARIO}}

# Collect logs for debugging
collect-logs:
    ./scripts/collect-logs.sh

# Take a screenshot of the app
screenshot:
    ./scripts/screenshot.sh

# Take a frontend visual proof screenshot for a component (see docs/frontend-visual-proof.md)
# One-time setup: npx playwright install chromium
# Requires: preview.html + src/__preview__/main.tsx (gitignored, create per task then delete)
preview-screenshot COMPONENT:
    node scripts/preview-screenshot.mjs {{COMPONENT}}

# Generate frontend coverage report (outputs coverage/frontend/lcov.info)
coverage-fe:
    npm run test:coverage

# Generate backend coverage report (outputs coverage/backend/)
# Requires: cargo install cargo-tarpaulin
# --features dev-fixtures compiles the codec round-trip integration tests in,
# so the workbook-coupled parser logic they exercise is measured instead of
# reported as uncovered (the fixtures live in src-tauri/tests/fixtures/).
coverage-be:
    mkdir -p coverage/backend && cd src-tauri && SQLX_OFFLINE=true cargo tarpaulin --out Lcov Html --output-dir ../coverage/backend --lib --tests --features dev-fixtures --exclude-files "build.rs" --exclude-files "dev/generate_bindings.rs" --exclude-files "dev/generate_fixtures.rs" --exclude-files "dev/fixtures_excel/*" --exclude-files "src/use_cases/overpayment/api.rs"

# Generate both coverage reports (run before /prune)
coverage: coverage-fe coverage-be

# Resource-capped check-full: runs the full quality suite in a memory-throttled, low-priority
# cgroup so heavy builds stay responsive on low-RAM machines (requires a systemd user session)
check-safe:
    systemd-run --user --scope -p MemoryHigh=4G -p CPUWeight=20 nice -n19 just check-full

# Resource-capped release: same memory guard around the full release flow
release-safe *ARGS:
    systemd-run --user --scope -p MemoryHigh=4G -p CPUWeight=20 nice -n19 just release {{ARGS}}
