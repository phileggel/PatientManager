#!/usr/bin/env bash
# harness.sh — CI's merge gate, locally, scoped to what moved.
#
# The branch diff against main (committed, staged, unstaged and untracked
# files) is classified by scripts/changed-scope.sh with the same rule as the
# Quality workflow (reviewer-infra FP: quality.yml gains this rule in PR #117,
# merged before this one): a layer runs its tests with coverage only when the change
# touched it, then its floor in coverage-gates.json is enforced; tooling
# changes run both; docs-only runs none. The privacy check
# and the script unit tests always run. E2E stays CI's job (it needs the built
# app under Xvfb).
#
# Use: just harness          (or: bash scripts/harness.sh)
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"

if [ -n "${NO_COLOR:-}" ]; then BLUE='' GREEN='' NC=''; else BLUE='\033[0;34m' GREEN='\033[0;32m' NC='\033[0m'; fi

command -v just >/dev/null 2>&1 || { echo "just not found — install it: https://github.com/casey/just" >&2; exit 1; }

base=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main 2>/dev/null || true)
if [ -z "$base" ]; then
    echo "No merge base with origin/main or main — fetch main first (git fetch origin main)." >&2
    exit 1
fi
changed=$(
    {
        git diff --name-only --diff-filter=ACMRD "$base" HEAD
        git diff --name-only --diff-filter=ACMRD HEAD
        git ls-files --others --exclude-standard
    } | sort -u
)
scope=$(printf '%s\n' "$changed" | bash scripts/changed-scope.sh)
echo -e "${BLUE}🔍 Harness scope: ${scope}${NC}"

python3 scripts/privacy-check.py
python3 scripts/arch-check.py
python3 -m unittest discover -s scripts/tests -p "test_*.py"

case "$scope" in
    docs)
        echo -e "${GREEN}✅ Docs only — privacy and script tests are the whole gate.${NC}"
        ;;
    frontend)
        python3 scripts/check.py --frontend --skip-tests
        just coverage-fe
        python3 scripts/coverage-gate.py --frontend
        ;;
    backend)
        python3 scripts/check.py --backend --skip-tests
        just coverage-be
        python3 scripts/coverage-gate.py --backend
        ;;
    both|none)
        python3 scripts/check.py --skip-tests
        just coverage-fe
        just coverage-be
        python3 scripts/coverage-gate.py
        ;;
    *)
        echo "unknown scope: $scope" >&2
        exit 1
        ;;
esac
echo -e "${GREEN}✅ Harness green for scope ${scope}.${NC}"
