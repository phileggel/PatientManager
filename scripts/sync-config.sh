#!/usr/bin/env bash
set -euo pipefail

# sync-config.sh — Stable bootstrap entry point for claude-kit.
#
# Copy this file once to scripts/sync-config.sh in your downstream project.
# This file is intentionally minimal — all sync logic lives in kit/scripts/sync.sh.
# After cloning the kit, this script self-updates from the kit if the bootstrap
# itself has changed, then re-executes the new version.
#
# Usage:
#   ./scripts/sync-config.sh            # sync latest release tag
#   ./scripts/sync-config.sh v4.0.0     # sync a specific tag
#   ./scripts/sync-config.sh -y         # overwrite drifted docs without prompting
#   ./scripts/sync-config.sh -h         # show help and exit

REPO="https://github.com/phileggel/claude-kit"
# Colors (respect NO_COLOR=1)
if [ -n "${NO_COLOR:-}" ]; then
    BLUE='' YELLOW='' NC=''
else
    BLUE='\033[0;34m'
    YELLOW='\033[0;33m'
    NC='\033[0m'
fi

# Capture original args before parsing so we can re-exec with them after self-update
ORIG_ARGS=("$@")

VERSION=""
KIT_SYNC_YES="false"

_print_help() {
    cat <<'EOF'
sync-config.sh — Sync claude-kit into a downstream project.

Usage:
  ./scripts/sync-config.sh              sync latest release tag
  ./scripts/sync-config.sh vX.Y.Z       sync a specific tag
  ./scripts/sync-config.sh -y           overwrite drifted docs without prompting
  ./scripts/sync-config.sh -h           show this help and exit

Flags:
  -y, --yes      auto-answer "yes" to the docs-drift overwrite prompt
  -h, --help     show this help and exit

Environment:
  SYNC_NO_HOOKS=1   skip auto-activation of core.hooksPath = .githooks
  NO_COLOR=1        disable ANSI colors
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
    --profile=* | --profile)
        echo -e "${YELLOW}⚠  --profile is deprecated and ignored — claude-kit is Tauri-only as of v4.0.0${NC}"
        # Skip the value too if --profile was given as a separate arg
        if [[ "$1" == "--profile" ]] && [[ $# -ge 2 ]]; then shift; fi
        shift
        ;;
    -y | --yes)
        KIT_SYNC_YES="true"
        shift
        ;;
    -h | --help)
        _print_help
        exit 0
        ;;
    -*)
        echo -e "${YELLOW}✗ Unknown flag: $1${NC}" >&2
        echo "Run with -h for usage." >&2
        exit 2
        ;;
    *)
        VERSION="$1"
        shift
        ;;
    esac
done

if [[ -z "$VERSION" ]]; then
    # Pick the latest release tag matching the downstream project's framework.
    # Downstream Svelte projects declare `{"framework":"svelte"}` in
    # .claude/kit.config.json — the bootstrap then filters to `svelte-v*` tags
    # so subsequent syncs do not accidentally jump to a React release. Absent
    # config (or `{"framework":"react"}`) keeps the legacy `v*` selection.
    _kit_framework="react"
    if [[ -f .claude/kit.config.json ]]; then
        _kit_framework=$(python3 -c "
import json, sys
try:
    fw = str(json.load(open('.claude/kit.config.json')).get('framework', 'react')).lower()
    print(fw if fw in ('react', 'svelte') else 'react')
except Exception:
    print('react')
" 2>/dev/null || echo react)
    fi
    if [[ "$_kit_framework" == "svelte" ]]; then
        _tag_filter='^svelte-v[0-9]'
    else
        _tag_filter='^v[0-9]'
    fi
    VERSION=$(git ls-remote --tags --sort="v:refname" "$REPO" |
        sed 's/.*\///; s/\^{}//' |
        grep -E "$_tag_filter" |
        tail -n1)
    if [[ -z "$VERSION" ]]; then
        echo -e "${YELLOW}⚠  No tag found matching framework=${_kit_framework}. Pass the version explicitly.${NC}" >&2
        exit 1
    fi
fi

TMP=$(mktemp -d)
# $TMP is NOT cleaned here — ownership passes to sync.sh via KIT_TMP

echo -e "${BLUE}⬇  Cloning claude-kit@${VERSION}...${NC}"
git clone --depth 1 --branch "$VERSION" "$REPO" "$TMP" --quiet \
    -c core.autocrlf=false

# ── Self-update (only on first invocation; KIT_SELF_UPDATED guards against loops) ──
if [[ -z "${KIT_SELF_UPDATED:-}" ]]; then
    SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
    KIT_BOOTSTRAP="$TMP/kit/sync-config.sh"
    if [[ -f "$KIT_BOOTSTRAP" ]] && ! cmp -s "$KIT_BOOTSTRAP" "$SELF"; then
        echo -e "${BLUE}🔄 Bootstrap updated in kit — refreshing $SELF and re-running...${NC}"
        cp "$KIT_BOOTSTRAP" "$SELF"
        chmod +x "$SELF"
        rm -rf "$TMP"
        export KIT_SELF_UPDATED=true
        exec "$SELF" "${ORIG_ARGS[@]}"
    fi
fi

export KIT_TMP="$TMP"
export KIT_SYNC_YES
exec bash "$TMP/kit/scripts/sync.sh" "$VERSION"
