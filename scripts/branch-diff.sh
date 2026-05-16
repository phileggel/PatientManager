#!/usr/bin/env bash
set -euo pipefail

# branch-diff.sh — Print the unified diff of one or more paths against the
# current branch's base (see `branch-base.sh`). Wraps the
#
#   BASE=$(git merge-base HEAD main 2>/dev/null || ...); git diff "$BASE"..HEAD -- <path>
#
# compound expression used by every kit reviewer agent so the Claude Code
# permission allowlist can match `Bash(bash scripts/branch-diff.sh *)`
# literally. With the wrapper, a reviewer SKILL.md prompt drops from
# ~one prompt per file (the inline form is not statically allowlistable)
# to zero prompts after the script is allowlisted once.
#
# Use:
#   bash scripts/branch-diff.sh src/lib/formatters.ts
#   bash scripts/branch-diff.sh src/foo.ts src/bar.ts
#
# Output: standard `git diff` text on stdout. Exits 0 even when the diff
# is empty (consumer decides how to react to an empty diff).

if [ "$#" -eq 0 ]; then
    echo "usage: bash scripts/branch-diff.sh <path> [<path>...]" >&2
    exit 2
fi

BASE=$(bash "$(dirname "$0")/branch-base.sh")
git diff "$BASE"..HEAD -- "$@"
