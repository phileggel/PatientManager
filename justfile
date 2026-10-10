# PatientManager - Command Runner
# Install just: https://github.com/casey/just

# The throwaway database the SQLx tooling connects to (schema only, never the
# application's database: the app reads no DATABASE_URL). Same path as
# scripts/check.py (SQLX_CHECK_DB) and CI (quality.yml). Set DATABASE_URL to
# point the recipes elsewhere.
sqlx_db_url := env("DATABASE_URL", "sqlite:" + justfile_directory() + "/src-tauri/.local/dev_check.sqlite")

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
clean-branches: (_used "clean-branches")
    #!/usr/bin/env bash
    set -euo pipefail
    git fetch --prune
    # Portable equivalent of `xargs -r` (which is GNU-only — BSD/macOS
    # xargs runs the command once with no arguments instead of skipping).
    stale=$(git branch -vv | grep ': gone]' | awk '{print $1}')
    [ -n "$stale" ] && echo "$stale" | xargs git branch -D || true

stat: (_used "stat")
    cloc . --vcs=git

# CI's merge gate, locally, scoped to what the branch changed (scripts/harness.sh):
# privacy + script tests always; lint, build and tests with coverage for the touched layers
harness:
    bash scripts/harness.sh

# Doc map and rule homes: every Markdown file in a location of docs/README.md, every rule ID defined once
rule-homes:
    python3 scripts/rule-homes.py

# Patient data check over every tracked file (SSN, IBAN, names in logs, real data files)
privacy-check:
    python3 scripts/privacy-check.py

# The figures of a batch for /flow-audit: `just flow-audit v0.24.0 v0.24.1 --previous v0.23.0 --pretty`
flow-audit *ARGS:
    python3 scripts/flow-audit.py {{ARGS}}

# Where the queue stands: queued, ready, blocked, debt, open pull requests (/whats-next proposes the order);
# `just whats-next close TODO-NNN` deletes a shipped entry's file; `just whats-next next-id DEBT` prints the next free id; `just whats-next remaining` the queued references not shipped yet
whats-next *ARGS:
    python3 scripts/whats-next.py {{ARGS}}

# Wait for a pull request's checks and say how they ended (default: the current branch's); exit 0 green, 1 failed
watch-pr *ARGS:
    python3 scripts/watch-pr.py {{ARGS}}

# One line in the usage log (logs/usage.log) for a recipe that runs no script of its own; scripts log themselves
_used RECIPE:
    @python3 scripts/usage_log.py used {{RECIPE}}

# Run the first ready entry of the queue (docs/work/queue.md) headless (docs/workflow.md § 9); logs under logs/next-todo/
next-todo:
    bash scripts/next-todo.sh

# Architecture rules A1–A8, B18 and B24 (scripts/arch-check.py); --write-allowlist only lowers the frozen debt
arch-check *ARGS:
    python3 scripts/arch-check.py {{ARGS}}

# Unit tests of the repository's own scripts
test-scripts: (_used "test-scripts")
    USAGE_LOG=off python3 -m unittest discover -s scripts/tests -p "test_*.py"

# Fast-forward merge the current feature branch into main and delete it.
# Refuses unless the branch is the head of an open PR with every check green
# (required-checks.json), or if FF is not safe (divergence, dirty tree, etc.).
merge:
    python3 scripts/merge.py

# Run pending migrations on the SQLx check database
# Prerequisite: sqlx must be on $PATH
migrate: (_used "migrate")
    @if [ -d src-tauri ]; then cd src-tauri && DATABASE_URL="{{sqlx_db_url}}" sqlx migrate run; else echo "ℹ skipping migrate (no src-tauri/)"; fi

# Regenerate SQLx offline query cache (run after schema or query changes).
# SQLX_OFFLINE=false forces online mode — projects that set SQLX_OFFLINE=true
# globally (in their .cargo/config.toml) still let `prepare` hit the live DB,
# which is its whole purpose. No-op for projects that haven't set SQLX_OFFLINE.
prepare-sqlx: (_used "prepare-sqlx")
    @if [ -d src-tauri ]; then cd src-tauri && SQLX_OFFLINE=false DATABASE_URL="{{sqlx_db_url}}" cargo sqlx prepare -- --tests; else echo "ℹ skipping prepare-sqlx (no src-tauri/)"; fi

# Auto-fix formatting and linting
format: (_used "format")
    @if [ -d src-tauri ]; then cd src-tauri && cargo fmt; else echo "ℹ skipping cargo fmt (no src-tauri/)"; fi
    @if [ -d src-tauri ]; then cd src-tauri && cargo clippy --fix --allow-dirty --quiet; else echo "ℹ skipping clippy (no src-tauri/)"; fi
    @if [ -f package.json ]; then npm run format:fix; else echo "ℹ skipping format:fix (no package.json)"; fi
    @if [ -f package.json ]; then npm run format:docs; else echo "ℹ skipping format:docs (no package.json)"; fi

# ⚠️  Destructive: deletes the SQLx check database and recreates its schema (never the application's data)
clean-db: (_used "clean-db")
    #!/usr/bin/env bash
    set -euo pipefail
    if [ ! -d src-tauri ]; then
        echo "ℹ skipping clean-db (no src-tauri/)"
        exit 0
    fi
    mkdir -p src-tauri/.local
    rm -rf src-tauri/.local/*
    cd src-tauri && DATABASE_URL="{{sqlx_db_url}}" sqlx database setup

# Start the application with hot reload
dev *ARGS:
    ./scripts/start-app.sh {{ARGS}}

# Regenerate Specta bindings: the project uses a dedicated binary for binding generation.
# The binary lives at `src-tauri/dev/generate_bindings.rs` (out of src/bin/ per
# gh#41 — Tauri's NSIS bundler walks src/bin/ and fails on phantom .exe entries).
generate-types: (_used "generate-types")
    cd src-tauri && cargo run --bin generate_bindings

# Regenerate dev fixture files for the import codec (IFC-033)
# Writes src-tauri/tests/fixtures/{surface}/{scenario}.{ext} + .expected.json.
# Optional SCENARIO arg: regenerate only that scenario.
regen-fixtures SURFACE='excel' SCENARIO='': (_used "regen-fixtures")
    cd src-tauri && cargo run --features dev-fixtures --bin generate_fixtures -- {{SURFACE}} {{SCENARIO}}

# Generate frontend coverage report (outputs coverage/frontend/lcov.info)
coverage-fe: (_used "coverage-fe")
    npm run test:coverage

# Generate backend coverage report (outputs coverage/backend/lcov.info)
# Requires: cargo install cargo-llvm-cov + rustup component add llvm-tools-preview
# --features dev-fixtures compiles the codec round-trip integration tests in,
# so the workbook-coupled parser logic they exercise is measured instead of
# reported as uncovered (the fixtures live in src-tauri/tests/fixtures/).
# Inline #[cfg(test)] code is then stripped from the report: a file's own tests
# never count as covered logic.
coverage-be: (_used "coverage-be")
    mkdir -p coverage/backend
    cd src-tauri && SQLX_OFFLINE=true cargo llvm-cov --lib --tests --features dev-fixtures --lcov --output-path ../coverage/backend/lcov.info --ignore-filename-regex '(^|/)build\.rs$|/dev/generate_(bindings|fixtures)\.rs$|/dev/fixtures_(excel|fund_pdf|bank_pdf)/|/src/use_cases/overpayment/api\.rs$|/src-tauri/tests/'
    python3 scripts/coverage-strip-tests.py coverage/backend/lcov.info

# Check the coverage reports against the floors in coverage-gates.json (run coverage-fe / coverage-be first); --frontend or --backend for one layer
coverage-gate *ARGS:
    python3 scripts/coverage-gate.py {{ARGS}}

# Generate both coverage reports
coverage: coverage-fe coverage-be
