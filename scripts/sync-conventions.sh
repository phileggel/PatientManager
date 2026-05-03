#!/usr/bin/env bash
# Fetches the latest convention docs from tauri-conventions into docs/.
# Run this from your project root whenever you want to pull upstream changes.
# Copy this script once to your project — it self-updates on each run.

set -euo pipefail

REPO="phileggel/tauri-conventions"
BRANCH="main"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
DOCS_DIR="docs"

FILES=(
  "backend-rules.md"
  "frontend-rules.md"
  "e2e-rules.md"
  "test_convention.md"
  "ddd-reference.md"
  "i18n-rules.md"
)

# Self-update: pull latest version of this script before syncing docs
SCRIPT_URL="${BASE_URL}/sync-conventions.sh"
SELF="$(realpath "$0")"
TMP_SCRIPT="$(mktemp)"
if curl -fsSL "$SCRIPT_URL" -o "$TMP_SCRIPT" 2>/dev/null; then
  if ! diff -q "$SELF" "$TMP_SCRIPT" > /dev/null 2>&1; then
    echo "sync-conventions.sh updated — re-executing..."
    cp "$TMP_SCRIPT" "$SELF"
    chmod +x "$SELF"
    rm "$TMP_SCRIPT"
    exec "$SELF" "$@"
  fi
fi
rm -f "$TMP_SCRIPT"

mkdir -p "$DOCS_DIR"

echo "Syncing convention docs from ${REPO}@${BRANCH}..."
for file in "${FILES[@]}"; do
  url="${BASE_URL}/docs/${file}"
  dest="${DOCS_DIR}/${file}"
  if curl -fsSL "$url" -o "$dest"; then
    echo "  ✓ ${file}"
  else
    echo "  ✗ ${file} (failed — skipped)"
  fi
done

echo "Done. Review git diff before committing."
