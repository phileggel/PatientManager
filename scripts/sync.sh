#!/usr/bin/env bash
set -euo pipefail

# sync.sh — Profile-aware sync logic for claude-kit.
#
# Executed from the cloned kit by the bootstrap (kit/sync-config.sh).
# This script is ephemeral — it runs from $TMP and is cleaned up on exit.
# Never run this script directly.
#
# Env vars:
#   KIT_TMP  — path to the cloned kit temp directory (required)
#   PROFILE  — profile name (optional, e.g. "tauri"); empty = generic only

TMP="${KIT_TMP:?KIT_TMP not set — run via scripts/sync-config.sh}"
VERSION="${1:?VERSION not set}"

trap 'rm -rf "$TMP"' EXIT

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(git rev-parse --show-toplevel)"

# Auto-detect profile from project if not passed by an old bootstrap script
if [[ -z "${PROFILE:-}" ]] && [[ -f "$PROJECT_ROOT/.claude/kit-profile" ]]; then
    PROFILE=$(tr -d '[:space:]' <"$PROJECT_ROOT/.claude/kit-profile")
fi

# ── Kit index & readme ────────────────────────────────────────────────────────
echo -e "${BLUE}📁 Syncing kit index and readme...${NC}"
mkdir -p "$PROJECT_ROOT/.claude"
cp "$TMP/kit/kit-tools.md" "$PROJECT_ROOT/.claude/"
cp "$TMP/kit/kit-readme.md" "$PROJECT_ROOT/.claude/"

# ── Generic agents (always) ───────────────────────────────────────────────────
echo -e "${BLUE}📁 Syncing generic agents...${NC}"
mkdir -p "$PROJECT_ROOT/.claude/agents"
for agent in "$TMP/kit/agents/"*.md; do
    [ -f "$agent" ] || continue
    cp "$agent" "$PROJECT_ROOT/.claude/agents/"
done

# ── Profile agents (overlay, additive) ───────────────────────────────────────
if [ -n "${PROFILE:-}" ] && [ -d "$TMP/kit/agents/$PROFILE" ]; then
    echo -e "${BLUE}📁 Syncing ${PROFILE} profile agents...${NC}"
    for agent in "$TMP/kit/agents/$PROFILE/"*.md; do
        [ -f "$agent" ] || continue
        cp "$agent" "$PROJECT_ROOT/.claude/agents/"
    done
fi

# ── Skills (always) ───────────────────────────────────────────────────────────
echo -e "${BLUE}📁 Syncing skills...${NC}"
for skill_dir in "$TMP/kit/skills/"/*/; do
    skill_name=$(basename "$skill_dir")
    mkdir -p "$PROJECT_ROOT/.claude/skills/$skill_name"
    cp "$skill_dir/SKILL.md" "$PROJECT_ROOT/.claude/skills/$skill_name/"
done

# ── Git hooks (always) ────────────────────────────────────────────────────────
echo -e "${BLUE}📁 Syncing .githooks...${NC}"
mkdir -p "$PROJECT_ROOT/.githooks"
cp "$TMP/kit/githooks/commit-msg" "$PROJECT_ROOT/.githooks/"
cp "$TMP/kit/githooks/pre-commit" "$PROJECT_ROOT/.githooks/"
cp "$TMP/kit/githooks/pre-merge-commit" "$PROJECT_ROOT/.githooks/"
cp "$TMP/kit/githooks/pre-push" "$PROJECT_ROOT/.githooks/"
cp "$TMP/kit/githooks/README.md" "$PROJECT_ROOT/.githooks/"

# ── Generic common.just (always) ──────────────────────────────────────────────
echo -e "${BLUE}📁 Syncing common justfile...${NC}"
cp "$TMP/kit/common.just" "$PROJECT_ROOT/common.just"

# ── Generic scripts (always) ──────────────────────────────────────────────────
# Top-level kit/scripts/*.sh are shared helpers used by agents in any profile.
echo -e "${BLUE}📁 Syncing generic scripts...${NC}"
mkdir -p "$PROJECT_ROOT/scripts"
for f in "$TMP/kit/scripts/"*.sh; do
    [ -f "$f" ] || continue
    cp "$f" "$PROJECT_ROOT/scripts/"
    chmod +x "$PROJECT_ROOT/scripts/$(basename "$f")"
done

# ── Profile scripts (skip if dir absent or contains only .gitkeep) ────────────
if [ -n "${PROFILE:-}" ] && [ -d "$TMP/kit/scripts/$PROFILE" ]; then
    HAS_SCRIPTS=false
    for f in "$TMP/kit/scripts/$PROFILE/"*; do
        [ -f "$f" ] || continue
        [ "$(basename "$f")" = ".gitkeep" ] && continue
        HAS_SCRIPTS=true
        break
    done
    if [ "$HAS_SCRIPTS" = true ]; then
        echo -e "${BLUE}📁 Syncing ${PROFILE} profile scripts...${NC}"
        mkdir -p "$PROJECT_ROOT/scripts"
        for f in "$TMP/kit/scripts/$PROFILE/"*; do
            [ -f "$f" ] || continue
            [ "$(basename "$f")" = ".gitkeep" ] && continue
            cp "$f" "$PROJECT_ROOT/scripts/"
        done
    fi
fi

# ── Profile justfile recipes (append with collision detection) ────────────────
if [ -n "${PROFILE:-}" ] && [ -f "$TMP/kit/justfile/$PROFILE.just" ]; then
    echo -e "${BLUE}📁 Appending ${PROFILE} justfile recipes...${NC}"

    _PROFILE_JUST="$TMP/kit/justfile/$PROFILE.just"

    # Collect local justfiles to scan for recipe name collisions.
    # Includes common.just (already synced) to catch kit-level conflicts too.
    _local_just_files=()
    for _jf in "$PROJECT_ROOT/justfile" "$PROJECT_ROOT"/*.just; do
        [ -f "$_jf" ] || continue
        [[ "$(basename "$_jf")" == "common.just" ]] && continue
        _local_just_files+=("$_jf")
    done
    [ -f "$PROJECT_ROOT/common.just" ] && _local_just_files+=("$PROJECT_ROOT/common.just")

    # Extract recipe names from justfiles (Python handles edge cases cleanly)
    _PY_EXTRACT='
import sys, re
pat = re.compile(r"^([a-zA-Z_][a-zA-Z0-9_-]*)(?:[ \t]+[^:\n]*)?:(?!=)", re.MULTILINE)
for path in sys.argv[1:]:
    try:
        for m in pat.finditer(open(path, encoding="utf-8").read()):
            print(m.group(1))
    except (FileNotFoundError, IsADirectoryError):
        pass
'
    _local_recipes=""
    if [ ${#_local_just_files[@]} -gt 0 ]; then
        _local_recipes=$(python3 -c "$_PY_EXTRACT" "${_local_just_files[@]}")
    fi
    _profile_recipes=$(python3 -c "$_PY_EXTRACT" "$_PROFILE_JUST")

    # Find recipe names defined in the profile that already exist locally
    _collision_list=""
    for _r in $_profile_recipes; do
        if echo "$_local_recipes" | grep -qxF "$_r"; then
            _collision_list="$_collision_list $_r"
        fi
    done
    _collision_list="${_collision_list# }"

    if [ -z "$_collision_list" ]; then
        # No collisions — append the profile recipes as-is
        printf '\n' >>"$PROJECT_ROOT/common.just"
        cat "$_PROFILE_JUST" >>"$PROJECT_ROOT/common.just"
    else
        # Warn about each collision, then filter them out before appending
        for _r in $_collision_list; do
            echo -e "${YELLOW}⚠  $_r already defined locally — skipping profile default. Review ${PROFILE}.just if you want the new version.${NC}"
        done

        _filtered=$(mktemp)
        python3 - "$_PROFILE_JUST" $_collision_list >"$_filtered" <<'_PY_FILTER_EOF'
import sys, re

src_file, skip_names = sys.argv[1], set(sys.argv[2:])
with open(src_file, encoding='utf-8') as f:
    lines = f.readlines()

RECIPE_RE = re.compile(r'^([a-zA-Z_][a-zA-Z0-9_-]*)(?:[ \t]+[^:\n]*)?:(?!=)')
output, pending, skipping = [], [], False

for line in lines:
    stripped = line.rstrip('\n')
    m = RECIPE_RE.match(stripped)
    if m:
        if m.group(1) in skip_names:
            skipping, pending = True, []
        else:
            skipping = False
            output.extend(pending)
            pending = []
            output.append(line)
    elif stripped and stripped[0] in (' ', '\t'):
        if not skipping:
            output.append(line)
    else:
        if not skipping:
            pending.append(line)
        elif not stripped or stripped.startswith('#'):
            skipping = False
            pending.append(line)

output.extend(pending)
sys.stdout.write(''.join(output))
_PY_FILTER_EOF

        if [ -s "$_filtered" ]; then
            printf '\n' >>"$PROJECT_ROOT/common.just"
            cat "$_filtered" >>"$PROJECT_ROOT/common.just"
        fi
        rm -f "$_filtered"
    fi
fi

# ── Version stamp & changelog delta ───────────────────────────────────────────
# Read previous version: prefer .claude/kit-version.md (current format),
# fall back to legacy .claude-kit-version (removed below once migrated).
PREV_VERSION=""
if [ -f "$PROJECT_ROOT/.claude/kit-version.md" ]; then
    PREV_VERSION=$(grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' "$PROJECT_ROOT/.claude/kit-version.md" | head -n1 || true)
fi
if [ -z "$PREV_VERSION" ] && [ -f "$PROJECT_ROOT/.claude-kit-version" ]; then
    PREV_VERSION=$(tr -d '[:space:]' <"$PROJECT_ROOT/.claude-kit-version")
fi

TODAY=$(date +%Y-%m-%d)

if [ -z "$PREV_VERSION" ]; then
    DELTA_BODY="_Initial install._"
elif [ "$PREV_VERSION" = "$VERSION" ]; then
    DELTA_BODY="_No changes since previous sync._"
else
    DELTA=$(
        python3 - "$TMP/CHANGELOG.md" "$PREV_VERSION" "$VERSION" <<'_PY_DELTA_EOF'
import re, sys
path, prev, curr = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    text = open(path, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit(0)
header = re.compile(r'^## \[(v\d+\.\d+\.\d+)\].*$', re.MULTILINE)
matches = list(header.finditer(text))
collecting, out = False, []
for i, m in enumerate(matches):
    version = m.group(1)
    if not collecting:
        if version == curr:
            collecting = True
        else:
            continue
    if version == prev:
        break
    start = m.end()
    end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
    bullets = re.findall(r'^- (.+)$', text[start:end], re.MULTILINE)
    summary = '; '.join(bullets) if bullets else '(no changes recorded)'
    out.append(f"- {version}: {summary}")
print('\n'.join(out))
_PY_DELTA_EOF
    )
    if [ -n "$DELTA" ]; then
        DELTA_BODY="## Changes since ${PREV_VERSION} (your previous sync)

${DELTA}"
    else
        DELTA_BODY="_No changelog entries between ${PREV_VERSION} and ${VERSION}._"
    fi
fi

cat >"$PROJECT_ROOT/.claude/kit-version.md" <<EOF
# Kit version

claude-kit **${VERSION}** — synced ${TODAY}

${DELTA_BODY}
EOF

# Remove legacy version file — superseded by .claude/kit-version.md
rm -f "$PROJECT_ROOT/.claude-kit-version"

if [ -n "${PROFILE:-}" ]; then
    echo -e "${GREEN}✅ Synced claude-kit@${VERSION} — generic agents + profile: ${PROFILE}${NC}"
else
    echo -e "${GREEN}✅ Synced claude-kit@${VERSION} — generic agents only${NC}"
fi
echo -e "${YELLOW}→ Review changes before committing (git diff).${NC}"
if [ -n "$PREV_VERSION" ] && [ "$PREV_VERSION" != "$VERSION" ]; then
    echo -e "${YELLOW}→ Run /kit-discover to reconcile CLAUDE.md with the new kit surface.${NC}"
fi
