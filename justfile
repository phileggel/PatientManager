# ProjectSF - Command Runner
# Install just: https://github.com/casey/just

import "common.just"

# List all available commands
default:
    @just --list

# Start the application with hot reload
dev *ARGS:
    ./scripts/start-app.sh {{ARGS}}

# Override kit default: project uses a dedicated binary with generate-bindings feature
generate-types:
    cd src-tauri && cargo run --features generate-bindings --bin generate_bindings

# Collect logs for debugging
collect-logs:
    ./scripts/collect-logs.sh

# Take a screenshot of the app
screenshot:
    ./scripts/screenshot.sh

# Generate frontend coverage report (outputs coverage/lcov.info)
coverage-fe:
    npm run test:coverage

# Generate backend coverage report (outputs coverage/rust/)
# Requires: cargo install cargo-tarpaulin
coverage-be:
    mkdir -p coverage/rust && cd src-tauri && SQLX_OFFLINE=true cargo tarpaulin --out Lcov Html --output-dir ../coverage/rust --lib --exclude-files "build.rs" --exclude-files "src/bin/generate_bindings.rs"

# Generate both coverage reports (run before /prune)
coverage: coverage-fe coverage-be

# Sync convention docs from phileggel/tauri-conventions
sync-conventions:
    ./scripts/sync-conventions.sh
