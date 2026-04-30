#!/usr/bin/env bash
# SessionStart hook — installs the toolchain Claude Code on the web needs to
# build/test this project. Web containers are ephemeral, so we re-install on
# every session unless the binaries are already cached.
#
# Idempotent. Synchronous: the agent waits for this to finish before starting,
# which avoids races between the agent loop and dependency install.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

log() { printf '[session-start] %s\n' "$*"; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
fi

###############################################################################
# 1. System packages (Tauri Linux deps + `just` runner)
###############################################################################
APT_PACKAGES=(
    just
    libwebkit2gtk-4.1-dev
    libxdo-dev
    libssl-dev
    libayatana-appindicator3-dev
    librsvg2-dev
    libsoup-3.0-dev
    libjavascriptcoregtk-4.1-dev
)

missing=()
for pkg in "${APT_PACKAGES[@]}"; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
        missing+=("$pkg")
    fi
done

if [ "${#missing[@]}" -gt 0 ]; then
    log "Installing apt packages: ${missing[*]}"
    # Some web base images ship broken third-party PPAs (deadsnakes, ondrej)
    # that 403 on `apt-get update`. Tolerate that — the base Ubuntu repos are
    # what we actually need.
    $SUDO apt-get update -y 2>/dev/null || log "apt-get update reported errors (likely stale 3rd-party PPAs); continuing"
    $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${missing[@]}"
else
    log "apt packages already present"
fi

###############################################################################
# 2. sqlx-cli (needed for `just check` SQLx Prepare step + migrations)
###############################################################################
if ! command -v sqlx >/dev/null 2>&1; then
    log "Installing sqlx-cli (sqlite only)"
    cargo install sqlx-cli --no-default-features --features sqlite --locked
else
    log "sqlx-cli already installed: $(sqlx --version)"
fi

###############################################################################
# 3. npm dependencies
###############################################################################
if [ -f "${CLAUDE_PROJECT_DIR:-$PWD}/package.json" ]; then
    log "Installing npm dependencies"
    cd "${CLAUDE_PROJECT_DIR:-$PWD}"
    npm install --no-audit --no-fund
fi

log "Session bootstrap complete"
