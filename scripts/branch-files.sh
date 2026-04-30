#!/usr/bin/env bash
set -euo pipefail

# branch-files.sh — Print sort-unique list of all files changed on the current
# branch relative to main, plus any uncommitted (staged / unstaged / untracked)
# changes. Use in review agents that run after commits are already made.
#
# Use:
#   bash scripts/branch-files.sh
#   bash scripts/branch-files.sh | grep -E '\.(rs|ts|tsx)$'
#
# Output: one path per line, alphabetically sorted, deduplicated, no headers.

BASE=$(git merge-base HEAD main 2>/dev/null || git rev-parse main 2>/dev/null || echo "HEAD")

{
    git diff --name-only "$BASE"..HEAD
    git diff --name-only HEAD
    git diff --name-only --cached
    git status --porcelain | awk '/^\?\?/ {print $2}'
} | sort -u | grep -v '^$' || true
