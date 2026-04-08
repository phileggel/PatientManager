#!/usr/bin/env bash
set -euo pipefail

# sync-config.sh — Stable bootstrap entry point for tauri-claude-kit.
#
# Copy this file once to scripts/sync-config.sh in your downstream project.
# This file is intentionally minimal — it never needs to be updated.
# All sync logic lives in kit/scripts/sync.sh inside the kit.
#
# Usage:
#   ./scripts/sync-config.sh           # sync latest release tag
#   ./scripts/sync-config.sh v1.6.0    # sync a specific tag

REPO="https://github.com/phileggel/tauri-claude-kit"
BLUE='\033[0;34m'
NC='\033[0m'

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
    VERSION=$(git ls-remote --tags --sort="v:refname" "$REPO" | tail -n1 | sed 's/.*\///; s/\^{}//')
fi

TMP=$(mktemp -d)
# $TMP is NOT cleaned here — ownership passes to sync.sh via KIT_TMP

echo -e "${BLUE}⬇  Cloning tauri-claude-kit@${VERSION}...${NC}"
git clone --depth 1 --branch "$VERSION" "$REPO" "$TMP" --quiet

export KIT_TMP="$TMP"
exec bash "$TMP/kit/scripts/sync.sh" "$VERSION"
