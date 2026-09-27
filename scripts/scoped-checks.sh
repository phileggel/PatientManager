#!/usr/bin/env bash
# scoped-checks.sh — the fast checks a change needs, and nothing else.
#
# Reads changed paths on stdin (one per line) and runs:
#   - Prettier on the Markdown among them (still on disk);
#   - `check.py --fast` for the layers they touch (scripts/changed-scope.sh):
#     frontend, backend, or both. Docs and tooling pay no code check here —
#     CI runs the full suite on every pull request.
#
# The script unit tests never run here: a hook exports GIT_DIR, and tests that
# build throwaway repositories must not inherit it. They run in CI, in
# `just test-scripts` and in `just harness`.
#
# Shared by the pre-commit and pre-push hooks. Exit 1 on the first failure.
#
# Use:
#   git diff --cached --name-only --diff-filter=ACMRD | bash scripts/scoped-checks.sh
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"

if [ -n "${NO_COLOR:-}" ]; then
    RED='' YELLOW='' GREEN='' BLUE='' NC=''
else
    RED='\033[0;31m' YELLOW='\033[0;33m' GREEN='\033[0;32m' BLUE='\033[0;34m' NC='\033[0m'
fi

CHANGED=$(sort -u)
SCOPE=$(printf '%s\n' "$CHANGED" | bash scripts/changed-scope.sh)

# Only Markdown that still exists: a deleted file has nothing to format.
MD_FILES=$(printf '%s\n' "$CHANGED" | grep -E '\.md$' | while IFS= read -r f; do [ -f "$f" ] && printf '%s\n' "$f"; done || true)
if [ -n "$MD_FILES" ]; then
    if printf '%s\n' "$MD_FILES" | tr '\n' '\0' | xargs -0 npx prettier --check >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Prettier: Markdown formatted.${NC}"
    else
        echo -e "${RED}❌ Prettier failed on Markdown. Run: just format${NC}"
        exit 1
    fi
fi

case "$SCOPE" in
    none|docs) echo -e "${BLUE}ℹ  Scope ${SCOPE}: no code check applies.${NC}"; exit 0 ;;
    frontend) FLAGS=(--fast --frontend) ;;
    backend) FLAGS=(--fast --backend) ;;
    both) FLAGS=(--fast) ;;
    *) echo -e "${YELLOW}⚠  Unknown scope: ${SCOPE}${NC}"; exit 1 ;;
esac

echo -e "${BLUE}🔍 Scope ${SCOPE}: fast checks (${FLAGS[*]}).${NC}"
if ! python3 scripts/check.py "${FLAGS[@]}"; then
    echo -e "${RED}❌ Quality checks failed.${NC}"
    exit 1
fi
