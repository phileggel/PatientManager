#!/usr/bin/env bash
set -euo pipefail

# branch.sh — Branch-base git operations.
#
# Single source of truth for "where did this branch diverge from main" plus
# the two operations that need that base: diff and log.
#
# Use:
#   bash scripts/branch.sh base                      # print resolved BASE
#   bash scripts/branch.sh diff <path> [<path>...]   # git diff BASE..HEAD -- paths
#   bash scripts/branch.sh log [git-log-flags]       # git log --oneline BASE..HEAD
#
# Output: stdout-only. base prints a sha-or-sentinel; diff/log forward the
# underlying git output verbatim. Never fails on base resolution — falls back
# through merge-base → rev-parse → "HEAD" so detached HEAD / shallow clone /
# missing-main branches still get a usable BASE.
#
# Why a script (vs inline shell in agent prompts):
#   Compound shell ($(...), &&, ||, ;) cannot be safely allowlisted in
#   Claude Code's permission system, which matches by literal prefix. A
#   literal `bash scripts/branch.sh diff foo.ts` call IS allowlistable as
#   `Bash(bash scripts/branch.sh *)`. One entry covers every consumer.

resolve_base() {
    git merge-base HEAD main 2>/dev/null ||
        git rev-parse main 2>/dev/null ||
        echo "HEAD"
}

case "${1:-}" in
base)
    resolve_base
    ;;
diff)
    shift
    if [ "$#" -lt 1 ]; then
        echo "usage: bash scripts/branch.sh diff <path> [<path> ...]" >&2
        exit 2
    fi
    BASE=$(resolve_base)
    git diff "$BASE"..HEAD -- "$@"
    ;;
log)
    shift
    BASE=$(resolve_base)
    git log --oneline "$@" "$BASE"..HEAD
    ;;
*)
    echo "usage: bash scripts/branch.sh {base|diff <paths>|log [flags]}" >&2
    exit 2
    ;;
esac
