# ProjectSF - Command Runner
# Install just: https://github.com/casey/just

# List all available commands
default:
    @just --list

# Start the application with hot reload
dev *ARGS:
    ./scripts/start-app.sh {{ARGS}}

# Run fast quality check (lint/format only, no tests)
check:
    python3 scripts/check.py --fast

# Run full quality check (tests + build + lint)
check-full:
    python3 scripts/check.py

# Generate TypeScript bindings from Rust
generate-types:
    cd src-tauri && cargo run --features generate-bindings --bin generate_bindings

# Release new version (interactive)
release *ARGS:
    python3 scripts/release.py {{ARGS}}

# Collect logs for debugging
collect-logs:
    ./scripts/collect-logs.sh

# Run pending database migrations
migrate:
    cd src-tauri && sqlx migrate run

# Take a screenshot of the app
screenshot:
    ./scripts/screenshot.sh

clean-db:
    rm -rf src-tauri/.local/*
    cd src-tauri && sqlx database setup

# remove old unused branches
clean-branches:
    git fetch --prune
    git branch -vv | grep ': gone]' | awk '{print $1}' | xargs git branch -D


# format
format: 
    cd src-tauri && cargo fmt
    cd src-tauri && cargo clippy --fix --allow-dirty
    npm run format:fix
    npm run format:docs
