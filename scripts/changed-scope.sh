#!/usr/bin/env bash
# changed-scope.sh — classify a list of changed paths (stdin, one per line)
# into the check scope they need. Prints exactly one word:
#
#   none      no application code, but tooling (workflows, scripts, hooks,
#             justfile, root config) — checks that exercise the app still run
#   docs      Markdown, docs/ and screenshots/ only — nothing a test can see
#   frontend  src/, e2e/, package.json, the TS/Vite/Biome configs, root web files
#   backend   src-tauri/ (except Markdown)
#   both      frontend and backend
#
# Use:
#   git diff --name-only BASE...HEAD | bash scripts/changed-scope.sh
set -euo pipefail

frontend=0
backend=0
docs=0
tooling=0

while IFS= read -r path || [[ -n "$path" ]]; do
    [[ -z "$path" ]] && continue
    case "$path" in
        *.md|docs/*|screenshots/*) docs=1 ;;
        src-tauri/*) backend=1 ;;
        src/*|e2e/*|public/*|package.json|package-lock.json|index.html|biome.json|\
        tsconfig*.json|vite.config.*|vitest.config.*|wdio.conf.*)
            frontend=1 ;;
        *) tooling=1 ;;
    esac
done

if [[ $frontend == 1 && $backend == 1 ]]; then echo both
elif [[ $frontend == 1 ]]; then echo frontend
elif [[ $backend == 1 ]]; then echo backend
elif [[ $tooling == 1 ]]; then echo none
elif [[ $docs == 1 ]]; then echo docs
else echo none
fi
