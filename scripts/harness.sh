#!/usr/bin/env bash
# harness.sh — CI's merge gate, locally, scoped to what moved.
#
# The branch diff against main (committed, staged, unstaged and untracked
# files) is classified by scripts/changed-scope.sh with the same rule as the
# Quality workflow: a layer runs its lint, build and tests only when the
# change touched it; tooling changes run both; docs-only runs none. The privacy
# check, the architecture rules, the doc map and the script unit tests always run.
# Coverage is CI's gate; `--coverage` measures it here too, against the floors in
# coverage-gates.json, before a first push. E2E stays CI's job (it needs the built
# app under Xvfb).
#
# Use: just harness [--coverage]   (or: bash scripts/harness.sh [--coverage])
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/usage-log.sh"

coverage=false
case "$#:${1:-}" in
    0:) ;;
    1:--coverage) coverage=true ;;
    *) echo "usage: harness.sh [--coverage]" >&2; exit 2 ;;
esac

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
python3 scripts/rule-homes.py
USAGE_LOG=off python3 -m unittest discover -s scripts/tests -p "test_*.py"

case "$scope" in
    docs)
        echo -e "${GREEN}✅ Docs only — privacy, architecture, doc map and script tests are the whole gate.${NC}"
        exit 0
        ;;
    frontend) layer=(--frontend) ;;
    backend) layer=(--backend) ;;
    both|none) layer=() ;;
    *)
        echo "unknown scope: $scope" >&2
        exit 1
        ;;
esac

if [ "$coverage" = true ]; then
    python3 scripts/check.py "${layer[@]}" --skip-tests
else
    python3 scripts/check.py "${layer[@]}"
fi
[ "$scope" = frontend ] || bash scripts/core-without-tauri.sh
if [ "$coverage" = true ]; then
    [ "$scope" = backend ] || just coverage-fe
    [ "$scope" = frontend ] || just coverage-be
    python3 scripts/coverage-gate.py "${layer[@]}"
fi
echo -e "${GREEN}✅ Harness green for scope ${scope}.${NC}"
