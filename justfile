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
coverage-be:
    mkdir -p coverage/backend && cd src-tauri && SQLX_OFFLINE=true cargo tarpaulin --out Lcov Html --output-dir ../coverage/backend --lib --exclude-files "build.rs" --exclude-files "src/bin/generate_bindings.rs"

# Generate both coverage reports (run before /prune)
coverage: coverage-fe coverage-be
