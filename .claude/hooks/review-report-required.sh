#!/usr/bin/env bash
# Stop hook of a CI reviewer session (`--settings` in review.yml's REVIEW_ARGS, so
# local sessions are unaffected): a session with no report is sent back once to save
# it. A session already sent back stops, so it cannot loop until the job's timeout; the
# workflow's retry and its last step stay as the backstop.
# Usage: review-report-required.sh <reviewer-agent>, the hook's JSON on stdin.
set -euo pipefail

agent="$1"
cd "${CLAUDE_PROJECT_DIR:-$PWD}"
if grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
    exit 0
fi
if compgen -G ".review/$agent-*.md" > /dev/null; then
    exit 0
fi
printf '{"decision":"block","reason":"No report is saved. Run bash .daneel/plugins/app/scripts/review-path.sh %s and save your full report at the path it prints, with the Write tool."}\n' "$agent"
