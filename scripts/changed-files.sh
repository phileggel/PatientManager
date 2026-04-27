#!/usr/bin/env bash
set -euo pipefail

# changed-files.sh — Print sort-unique list of files in flight on the current
# branch: tracked changes (staged + unstaged) plus untracked files.
#
# Use:
#   bash scripts/changed-files.sh
#   bash scripts/changed-files.sh | grep -E '\.(rs|ts|tsx)$'
#
# Output: one path per line, alphabetically sorted, deduplicated, no headers.

{
    git diff --name-only HEAD
    git diff --name-only --cached
    git status --porcelain | awk '/^\?\?/ {print $2}'
} | sort -u | grep -v '^$' || true
