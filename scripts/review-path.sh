#!/usr/bin/env bash
# Compute and print the next available reviewer report path for a given reviewer slug.
# Usage: bash scripts/review-path.sh <reviewer-slug>
# Output: .review/<slug>-YYYY-MM-DD-NN.md  (NN is zero-padded, auto-incremented)
#
# In CI a reviewer (.claude/agents/reviewer-*.md) calls this and writes its
# report there: the workflow builds the pull request comment from the file
# (.github/workflows/review.yml). Locally the reviewer's reply is the report
# and nothing is written. `.review/` is gitignored.
#
# Concurrency: the script reads-then-prints without locking, so two parallel
# callers can both compute -NN before either writes the file, and the second
# writer will clobber the first. Callers MUST serialize reviewer invocations
# within a batch (the standard reviewer-batch pattern already does this).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/usage-log.sh"

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <reviewer-slug>" >&2
    exit 1
fi

SLUG="$1"
mkdir -p .review
DATE=$(date +%Y-%m-%d)

MAX=0
for f in .review/"${SLUG}-${DATE}"-*.md; do
    [[ -e "$f" ]] || continue
    NN="${f##*-}"
    NN="${NN%.md}"
    NN=$((10#$NN))
    ((NN > MAX)) && MAX=$NN
done

printf ".review/%s-%s-%02d.md\n" "$SLUG" "$DATE" $((MAX + 1))
