#!/usr/bin/env bash
# review-lanes.sh — the reviewer agents a change needs, and only those.
#
# Reads changed paths on stdin (one per line) and prints one lane per line,
# in this order: backend, frontend, arch, sql, infra, security, e2e. Nothing
# for a docs-only change. `--json` prints {"backend":true,...} for CI.
#
# Each pattern mirrors the reviewer's own scope, so a lane never fires on
# files the agent would refuse (an empty-result halt writes no report):
#   backend   any .rs                          reviewer-backend
#   frontend  .ts/.tsx outside e2e/            reviewer-frontend
#   arch      backend or frontend              reviewer-arch
#   sql       src-tauri/migrations/*.sql       reviewer-sql
#   infra     workflows, hooks, scripts, justfile, package.json, Cargo.toml,
#             tauri.conf.json, capabilities    reviewer-infra
#   security  the IPC boundary: api.rs, capabilities, the command registry,
#             secure_path.rs                   reviewer-security
#   e2e       e2e/**/*.test.ts                 reviewer-e2e
#
# Use (local, before a PR):  bash scripts/branch.sh files | bash scripts/review-lanes.sh
set -euo pipefail

files=$(cat)
has() { grep -Eq "$1" <<<"$files" && echo true || echo false; }

backend=$(has '\.rs$')
frontend=$( { grep -Ev '^e2e/' <<<"$files" || true; } | grep -Eq '\.(ts|tsx)$' && echo true || echo false)
arch=false
if [[ "$backend" == true || "$frontend" == true ]]; then arch=true; fi
sql=$(has '^src-tauri/migrations/.*\.sql$')
infra=$(has '^(\.github/workflows/[^/]*\.ya?ml|\.githooks/.*|scripts/[^/]*\.(sh|bat|py)|justfile|package\.json|src-tauri/Cargo\.toml|src-tauri/tauri\.conf\.json|src-tauri/capabilities/.*\.json)$')
security=$(has '^src-tauri/(src/.*/api\.rs|capabilities/.*\.json|src/shared/infrastructure/(specta_builder|secure_path)\.rs)$')
e2e=$(has '^e2e/.*\.test\.ts$')

if [[ "${1:-}" == "--json" ]]; then
    printf '{"backend":%s,"frontend":%s,"arch":%s,"sql":%s,"infra":%s,"security":%s,"e2e":%s}\n' \
        "$backend" "$frontend" "$arch" "$sql" "$infra" "$security" "$e2e"
    exit 0
fi
for lane in backend frontend arch sql infra security e2e; do
    if [[ "${!lane}" == true ]]; then echo "$lane"; fi
done
