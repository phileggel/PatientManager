#!/usr/bin/env bash
set -euo pipefail

# validate-sync.sh — Verify every file recorded in `.claude/kit-manifest.txt`
# is present in the project. Invoked by the /kit-discover skill after a sync;
# also runnable standalone for ad-hoc post-sync verification.
#
# Use:
#   bash scripts/validate-sync.sh
#
# Exit codes:
#   0 — all manifest entries present
#   1 — one or more missing (each reported on stderr)
#   2 — manifest itself missing (run `just sync-kit` first)

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
MANIFEST="$PROJECT_ROOT/.claude/kit-manifest.txt"

# Colors (respect NO_COLOR=1)
if [ -n "${NO_COLOR:-}" ]; then
    YELLOW='' GREEN='' RED='' BLUE='' NC=''
else
    YELLOW='\033[0;33m'
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    BLUE='\033[0;34m'
    NC='\033[0m'
fi

if [ ! -f "$MANIFEST" ]; then
    echo -e "${RED}❌ .claude/kit-manifest.txt not found${NC}" >&2
    echo -e "${BLUE}→ Run \`just sync-kit\` first.${NC}" >&2
    exit 2
fi

missing=()
total=0
while IFS= read -r path; do
    [ -z "$path" ] && continue
    total=$((total + 1))
    if [ ! -e "$PROJECT_ROOT/$path" ]; then
        missing+=("$path")
    fi
done <"$MANIFEST"

if [ ${#missing[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ Sync valid: ${total} files in place.${NC}"
    exit 0
fi

echo -e "${RED}❌ Sync incomplete: ${#missing[@]} of ${total} manifest entries missing.${NC}" >&2
for m in "${missing[@]}"; do
    echo -e "  ${RED}✗${NC} $m" >&2
done
echo -e "${BLUE}→ Re-run \`just sync-kit\` (or \`just sync-kit -f\` to overwrite drifted docs).${NC}" >&2
exit 1
