#!/usr/bin/env bash
set -euo pipefail

# branch-files-ext.sh — Filter `branch-files.sh` output by a file-extension
# regex and an optional path-exclude regex. Wraps the
#
#   bash scripts/branch-files.sh | grep -E <ext> | grep -v <exclude>
#
# pipe chain that every kit reviewer agent uses in Step 1, so the Claude
# Code permission allowlist can match `Bash(bash scripts/branch-files-ext.sh *)`
# literally. The pipe form is not statically allowlistable — `grep` is a
# separate command from `bash scripts/branch-files.sh`, so each pipe segment
# would otherwise need its own allowlist entry (or a per-invocation prompt).
#
# Use:
#   bash scripts/branch-files-ext.sh '\.(ts|tsx)$'              # frontend lane
#   bash scripts/branch-files-ext.sh '\.(rs|ts|tsx)$' '^e2e/'   # arch lane
#   bash scripts/branch-files-ext.sh '\.sql$'                   # migrations
#
# Output: one path per line, alphabetically sorted, deduplicated. Empty
# output is a normal "no matches" signal — callers decide how to react.

ext_pattern="${1:-.}"
exclude_pattern="${2:-}"

files=$(bash "$(dirname "$0")/branch-files.sh")
if [ -n "$exclude_pattern" ]; then
    echo "$files" | grep -E "$ext_pattern" | grep -v "$exclude_pattern" || true
else
    echo "$files" | grep -E "$ext_pattern" || true
fi
