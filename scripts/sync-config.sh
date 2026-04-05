#!/usr/bin/env bash
set -euo pipefail

# sync-config.sh — Pull tauri-claude-kit into the current project
#
# Usage:
#   ./scripts/sync-config.sh          # pulls latest main
#   ./scripts/sync-config.sh v1.2.0   # pulls a specific tag

REPO="https://github.com/phileggel/tauri-claude-kit"
VERSION="${1:-main}"

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

# Step 1: Clone the kit (needed for self-update check and sync)
TMP=$(mktemp -d)

echo -e "${BLUE}⬇  Cloning tauri-claude-kit@${VERSION}...${NC}"
git clone --depth 1 --branch "$VERSION" "$REPO" "$TMP" --quiet

# Step 2: Self-update check — if sync-config.sh changed, re-exec with new version
if ! diff -q "$SELF" "$TMP/scripts/sync-config.sh" > /dev/null 2>&1; then
    echo -e "${YELLOW}🔄 sync-config.sh has changed, self-updating and re-running...${NC}"
    cp "$TMP/scripts/sync-config.sh" "$SELF"
    chmod +x "$SELF"
    rm -rf "$TMP"
    exec "$SELF" "$@"
fi

# Step 3: Sync all files (repo already cloned in $TMP)
trap 'rm -rf "$TMP"' EXIT

echo -e "${BLUE}📁 Syncing agents...${NC}"
mkdir -p "$PROJECT_ROOT/.claude/agents"
cp "$TMP/agents/"*.md "$PROJECT_ROOT/.claude/agents/"

echo -e "${BLUE}📁 Syncing skills...${NC}"
for skill_dir in "$TMP/skills/"/*/; do
  skill_name=$(basename "$skill_dir")
  mkdir -p "$PROJECT_ROOT/.claude/skills/$skill_name"
  cp "$skill_dir/SKILL.md" "$PROJECT_ROOT/.claude/skills/$skill_name/"
done

echo -e "${BLUE}📁 Syncing scripts...${NC}"
cp "$TMP/scripts/check.py" "$PROJECT_ROOT/scripts/"
cp "$TMP/scripts/release.py" "$PROJECT_ROOT/scripts/"

echo -e "${BLUE}📁 Syncing .githooks...${NC}"
cp "$TMP/.githooks/commit-msg" "$PROJECT_ROOT/.githooks/"
cp "$TMP/.githooks/pre-commit" "$PROJECT_ROOT/.githooks/"
cp "$TMP/.githooks/pre-push" "$PROJECT_ROOT/.githooks/"
cp "$TMP/.githooks/README.md" "$PROJECT_ROOT/.githooks/"

echo -e "${BLUE}📁 Syncing common justfile...${NC}"
cp "$TMP/common.just" "$PROJECT_ROOT/common.just"

echo "$VERSION" > "$PROJECT_ROOT/.claude-kit-version"

echo -e "${GREEN}✅ Synced tauri-claude-kit@${VERSION}${NC}"
echo -e "${YELLOW}→ Review changes before committing (git diff).${NC}"
