#!/usr/bin/env bash
set -euo pipefail

# branch-base.sh — Print the base SHA used when comparing the current branch
# against `main`. Same three-step fallback as `branch-files.sh` so all
# branch-scoped helpers agree on what "base" means.
#
# Use:
#   bash scripts/branch-base.sh                    # e.g. via $(...) in another script
#   BASE=$(bash scripts/branch-base.sh)            # ad hoc in a terminal
#
# Wrapping the fallback chain in a script lets the Claude Code permission
# allowlist match `Bash(bash scripts/branch-base.sh *)` literally. The
# raw inline form `$(git merge-base HEAD main 2>/dev/null || ...)` cannot
# be statically allowlisted because of the command substitution + pipes.

git merge-base HEAD main 2>/dev/null \
    || git rev-parse main 2>/dev/null \
    || echo "HEAD"
