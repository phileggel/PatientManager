#!/usr/bin/env bash
set -euo pipefail

# branch-files.sh — Print sort-unique list of all files changed on the current
# branch relative to main, plus any uncommitted (staged / unstaged / untracked)
# changes. Use in review agents that run after commits are already made.
#
# Use:
#   bash scripts/branch-files.sh                # all changed files
#   bash scripts/branch-files.sh --rust         # *.rs
#   bash scripts/branch-files.sh --frontend     # *.ts / *.tsx, excluding e2e/
#   bash scripts/branch-files.sh --arch         # *.rs / *.ts / *.tsx, excluding e2e/
#   bash scripts/branch-files.sh --e2e          # e2e/**/*.test.ts
#   bash scripts/branch-files.sh --migrations   # migrations/*
#   bash scripts/branch-files.sh --security     # *.rs / *.ts / *.tsx OR capabilities/**/*.json
#
# The named filters exist so reviewer-* agent prompts can call a single literal
# command (no shell pipe) — Claude Code's permission allowlist matches by
# literal prefix, and `branch-files.sh | grep ...` triggers a fresh permission
# prompt on every distinct shape. One `Bash(bash scripts/branch-files.sh *)`
# entry covers every filtered invocation.
#
# Output: one path per line, alphabetically sorted, deduplicated, no headers.

FILTER='.'
EXCLUDE=''
case "${1:-}" in
"") ;;
--rust) FILTER='\.rs$' ;;
--frontend)
    FILTER='\.(ts|tsx)$'
    EXCLUDE='^e2e/'
    ;;
--arch)
    FILTER='\.(rs|ts|tsx)$'
    EXCLUDE='^e2e/'
    ;;
--e2e) FILTER='^e2e/.*\.test\.ts$' ;;
--migrations) FILTER='^migrations/' ;;
--security) FILTER='\.(rs|ts|tsx)$|capabilities/.*\.json$' ;;
*)
    echo "usage: bash scripts/branch-files.sh [--rust|--frontend|--arch|--e2e|--migrations|--security]" >&2
    exit 2
    ;;
esac

BASE=$(bash "$(dirname "$0")/branch.sh" base)

collect() {
    {
        git diff --name-only "$BASE"..HEAD
        git diff --name-only HEAD
        git diff --name-only --cached
        git status --porcelain | awk '/^\?\?/ {print $2}'
    } | sort -u | grep -v '^$' || true
}

if [ -n "$EXCLUDE" ]; then
    collect | grep -E "$FILTER" | grep -v -E "$EXCLUDE" || true
else
    collect | grep -E "$FILTER" || true
fi
