#!/usr/bin/env bash
# core-without-tauri.sh — the application core builds without the Tauri shell (B47).
#
# Tauri is the optional `app` feature of the crate. Without it, contexts, use
# cases and persistence must still build, with no warning (a warning here is
# code only the shell reaches) and with no Tauri crate in the dependency tree,
# so another adapter — the command line, a server — can link the same core.
#
# Use: bash scripts/core-without-tauri.sh   (run by `just harness` and by CI)
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/usage-log.sh"

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT/src-tauri"

SQLX_OFFLINE=true cargo clippy --lib --no-default-features --quiet -- -D warnings

tree=$(cargo tree -e normal,build --no-default-features --prefix none)
if grep -E '^tauri' <<<"$tree"; then
    echo "❌ a Tauri crate is a dependency of the core (listed above)" >&2
    exit 1
fi
echo "✅ core without Tauri: it builds, and no Tauri crate is in its dependency tree"
